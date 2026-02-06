import { Request, Response } from 'express';
import fetch from 'node-fetch';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '') ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY for auth controller');
}

export async function resetPassword(req: Request, res: Response) {
  const { token, new_password: password, email } = req.body ?? {};
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
    const response = await fetch(`${SUPABASE_URL}/auth/v1/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
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
    console.error('resetPassword error', error);
    return res
      .status(HTTP_STATUS_CODES.InternalServerError)
      .json({ error: 'Unable to reset password at this time' });
  }
}

export default { resetPassword };
