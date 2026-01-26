import { Request, Response } from 'express';
import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

async function getAuthenticatedUserId(req: Request) {
  const authHeader = req.header('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice('bearer '.length) : null;
  if (!token) {
    return null;
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return null;
  }
  return data.user.id;
}

async function userIsCaretaker(userId: string, profileId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', profileId)
    .single();
  if (error) {
    logger.err(error);
    return false;
  }
  return data?.caretaker_id === userId;
}

async function registerDeviceToken(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params as { profileId?: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  if (!(await userIsCaretaker(userId, profileId))) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { expoPushToken, platform, locale, metadata } = req.body as {
    expoPushToken?: string;
    platform?: string;
    locale?: string;
    metadata?: Record<string, any>;
  };

  if (!expoPushToken || !platform) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({
      error: 'expoPushToken and platform are required',
    });
  }

  const payload = {
    profile_id: profileId,
    expo_push_token: expoPushToken,
    platform,
    locale: locale ?? null,
    metadata: metadata ?? null,
    is_active: true,
    last_seen_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('profile_device_tokens')
    .upsert(payload, { onConflict: 'expo_push_token', ignoreDuplicates: false })
    .select(
      'id, profile_id, expo_push_token, platform, locale, metadata, is_active, last_seen_at, created_at, updated_at'
    )
    .maybeSingle();

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to register device' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ device: data });
}

export default {
  registerDeviceToken,
};
