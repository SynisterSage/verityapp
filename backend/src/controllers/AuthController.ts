import { Request, Response } from 'express';
import fetch from 'node-fetch';

import logger from 'jet-logger';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { CURRENT_LEGAL_VERSIONS } from '@src/common/constants/LEGAL';
import supabaseAdmin from '@src/services/supabase';
import { createRefreshToken, validateAndRotateRefreshToken } from '@src/services/refreshTokens';
import { clearLoginAttempts, checkAccountLock, recordFailedLoginAttempt } from '@src/services/loginLockout';
import { getAuthenticatedUserId } from '@src/common/util/auth';

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '') ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY for auth controller');
}

export async function checkEmailExists(req: Request, res: Response) {
  const { email } = req.query ?? {};

  if (!email || typeof email !== 'string') {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({
      error: 'email query parameter is required',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabaseAdmin
    .from('auth.users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error) {
    logger.err(`checkEmailExists error: ${error.message}`);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({
      error: 'Unable to check email right now',
    });
  }

  const exists = Boolean(data?.id);
  return res.status(HTTP_STATUS_CODES.Ok).json({
    email: normalizedEmail,
    exists,
    message: exists ? 'Email is already in use.' : 'Email is available.',
  });
}

export async function getLegalVersions(req: Request, res: Response) {
  return res.status(HTTP_STATUS_CODES.Ok).json(CURRENT_LEGAL_VERSIONS);
}

export async function resetPassword(req: Request, res: Response) {
  const { token, new_password: password, email } = req.body ?? {};
  logger.info({
    message: 'resetPassword request received',
    tokenPresent: Boolean(token),
    passwordPresent: Boolean(password),
    email,
    path: req.path,
    method: req.method,
  });
  if (!token || !password) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({
      error: 'token and new_password are required',
    });
  }

  if (typeof password !== 'string' || password.length < 8) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({
      error: 'new_password must be at least 8 characters',
    });
  }

  const payload: Record<string, string> = {
    token,
    password,
  };
  if (typeof email === 'string' && email.trim()) {
    payload.email = email.trim();
  }

  try {
    // Use Supabase Admin API to update user password
    // The token is a recovery token that contains the user's identity
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${token}`, // Use the recovery token from the email
      },
      body: JSON.stringify({ password }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      logger.err({
        message: 'Supabase password reset failed',
        status: response.status,
        body,
      });
      const message =
        typeof body?.msg === 'string'
          ? body.msg
          : typeof body?.error_description === 'string'
          ? body.error_description
          : 'Failed to reset password';
      return res.status(response.status).json({ error: message });
    }

    return res.status(HTTP_STATUS_CODES.Ok).json({
      message: 'Password reset successful',
    });
  } catch (error) {
    logger.err('resetPassword error', error);
    return res
      .status(HTTP_STATUS_CODES.InternalServerError)
      .json({ error: 'Unable to reset password at this time' });
  }
}

export async function refreshToken(req: Request, res: Response) {
  const { refreshToken: token } = req.body ?? {};

  if (!token || typeof token !== 'string') {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({
      error: 'refreshToken is required in request body',
    });
  }

  try {
    // Validate and rotate the refresh token
    const { accessToken, refreshToken: newRefreshToken, expiresIn } = await validateAndRotateRefreshToken(token);

    return res.status(HTTP_STATUS_CODES.Ok).json({
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn,
      tokenType: 'Bearer',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Token refresh failed: ${errorMessage}`);

    // Return 401 for any token validation error
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({
      error: 'Invalid or expired refresh token. Please log in again.',
    });
  }
}

export async function recordLegalAcceptance(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({
      error: 'Unauthorized',
    });
  }

  const {
    terms_version,
    privacy_version,
    accepted_at,
    source,
    metadata,
  } = req.body ?? {};

  const parsedAcceptedAt = accepted_at ? new Date(accepted_at) : new Date();
  if (Number.isNaN(parsedAcceptedAt.getTime())) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({
      error: 'accepted_at must be a valid ISO date',
    });
  }

  const userAgent = req.header('user-agent') ?? null;
  const ipAddress = req.ip ?? null;

  if (
    terms_version !== CURRENT_LEGAL_VERSIONS.termsVersion ||
    privacy_version !== CURRENT_LEGAL_VERSIONS.privacyVersion
  ) {
    logger.warn(
      `[Legal] Non-current legal acceptance submitted terms=${terms_version} privacy=${privacy_version} currentTerms=${CURRENT_LEGAL_VERSIONS.termsVersion} currentPrivacy=${CURRENT_LEGAL_VERSIONS.privacyVersion}`
    );
  }

  const { error } = await supabaseAdmin.from('legal_acceptances').upsert(
    {
      user_id: userId,
      terms_version,
      privacy_version,
      accepted_at: parsedAcceptedAt.toISOString(),
      source: source ?? 'mobile_signup',
      metadata: metadata ?? {},
      user_agent: userAgent ? userAgent.slice(0, 512) : null,
      ip_address: ipAddress,
    },
    {
      onConflict: 'user_id,terms_version,privacy_version',
    }
  );

  if (error) {
    logger.err(`recordLegalAcceptance error: ${error.message}`);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({
      error: 'Unable to record legal acceptance',
    });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body ?? {};

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({
      error: 'email and password are required',
    });
  }

  try {
    // Attempt to sign in with Supabase
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData?.session || !signInData?.user) {
      // Sign in failed - return generic error
      // (We don't track failed attempts here because we don't know the user ID yet)
      logger.warn(`Failed login attempt for email ${email}: ${signInError?.message ?? 'invalid credentials'}`);
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({
        error: 'Invalid email or password',
      });
    }

    const userId = signInData.user.id;

    // ✅ Sign in successful - get user's profile to check account lock status
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('caretaker_id, login_attempts, locked_until')
      .eq('caretaker_id', userId)
      .maybeSingle();

    // Check if account is locked
    if (profile?.locked_until) {
      const lockedUntil = new Date(profile.locked_until);
      const now = new Date();

      if (now < lockedUntil) {
        const minutesRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000);
        logger.warn(`Login attempt for locked account ${userId}`);
        return res.status(HTTP_STATUS_CODES.Unauthorized).json({
          error: `Account locked. Try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`,
        });
      }
    }

    // Clear any previous failed attempts on successful login
    await clearLoginAttempts(userId);

    // Create refresh token for this session
    const refreshToken = await createRefreshToken(userId);

    logger.info(`User ${userId} logged in successfully`);

    return res.status(HTTP_STATUS_CODES.Ok).json({
      accessToken: signInData.session.access_token,
      refreshToken,
      expiresIn: 3600, // 1 hour
      tokenType: 'Bearer',
      user: {
        id: signInData.user.id,
        email: signInData.user.email,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.err(`Login endpoint error: ${errorMessage}`);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({
      error: 'An error occurred during login. Please try again.',
    });
  }
}

export default { resetPassword, checkEmailExists, refreshToken, login, recordLegalAcceptance };
