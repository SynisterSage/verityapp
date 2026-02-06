import { Request, Response } from 'express';
import fetch from 'node-fetch';

import logger from 'jet-logger';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import supabaseAdmin from '@src/services/supabase';

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

  try {
    // Query Supabase auth users to check if email exists
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    
    if (error !== null && error !== undefined) {
      logger.err('checkEmailExists error', error);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({
        error: 'Unable to check email availability',
      });
    }

    const exists = data.users.some((user) => user.email?.toLowerCase() === email.toLowerCase());
    
    return res.status(HTTP_STATUS_CODES.Ok).json({
      email,
      exists,
    });
  } catch (error) {
    logger.err('checkEmailExists error', error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({
      error: 'Unable to check email availability',
    });
  }
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

export default { resetPassword, checkEmailExists };
