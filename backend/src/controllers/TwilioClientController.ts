import { Request, Response } from 'express';
import logger from 'jet-logger';
import twilio from 'twilio';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import supabaseAdmin from '@src/services/supabase';

async function getAuthenticatedUserId(req: Request) {
  const authHeader = req.header('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length)
    : '';
  if (!token) {
    return '';
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return '';
  }
  return data.user.id;
}

async function userIsCaretaker(userId: string, profileId: string) {
  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', profileId)
    .maybeSingle();
  return profileRow?.caretaker_id === userId;
}

async function userCanAccessProfile(userId: string, profileId: string) {
  if (await userIsCaretaker(userId, profileId)) {
    return true;
  }
  const { data: memberRow } = await supabaseAdmin
    .from('profile_members')
    .select('id')
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(memberRow);
}

async function ensureProfile(profileId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, twilio_client_identity')
    .eq('id', profileId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data;
}

async function updateClientHeartbeat(profileId: string, identity: string) {
  await supabaseAdmin
    .from('profiles')
    .update({
      twilio_client_identity: identity,
      twilio_client_last_seen_at: new Date().toISOString(),
    })
    .eq('id', profileId);
}

async function createClientToken(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params as { profileId: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const allowed = await userCanAccessProfile(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const profile = await ensureProfile(profileId);
  if (!profile) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Profile not found' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? '';
  const apiKey = process.env.TWILIO_API_KEY ?? '';
  const apiSecret = process.env.TWILIO_API_SECRET ?? '';
  if (!accountSid || !apiKey || !apiSecret) {
    logger.err('Twilio API credentials are not configured');
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({
      error: 'Missing Twilio API credentials',
    });
  }

  const identity = profile.twilio_client_identity ?? `profile-${profileId}`;
  const ttlSeconds = Number(process.env.TWILIO_CLIENT_TOKEN_TTL ?? 3600);
  const AccessToken = twilio.jwt.AccessToken;
  const grant = new AccessToken.VoiceGrant({ incomingAllow: true });
  const token = new AccessToken(accountSid, apiKey, apiSecret, {
    identity,
    ttl: Number(ttlSeconds),
  });
  token.addGrant(grant);

  await updateClientHeartbeat(profileId, identity);

  return res.status(HTTP_STATUS_CODES.Ok).json({
    token: token.toJwt(),
    identity,
  });
}

async function recordClientHeartbeat(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params as { profileId: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const allowed = await userIsCaretaker(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { identity } = req.body as { identity?: string };
  const profile = await ensureProfile(profileId);
  if (!profile) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Profile not found' });
  }

  const resolvedIdentity = identity || profile.twilio_client_identity || `profile-${profileId}`;
  await updateClientHeartbeat(profileId, resolvedIdentity);

  return res.status(HTTP_STATUS_CODES.NoContent).end();
}

export default {
  createClientToken,
  recordClientHeartbeat,
};
