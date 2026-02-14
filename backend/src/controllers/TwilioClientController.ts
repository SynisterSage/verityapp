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

type LifecycleState =
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed'
  | 'ended';

const terminalStates = new Set<LifecycleState>(['disconnected', 'failed', 'ended']);
const activeStates = new Set<LifecycleState>(['ringing', 'connecting', 'connected', 'reconnecting']);

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
  const pushCredentialSid = process.env.TWILIO_PUSH_CREDENTIAL_SID_IOS ?? '';
  const voiceGrantOptions: Record<string, unknown> = { incomingAllow: true };
  if (pushCredentialSid) {
    voiceGrantOptions.pushCredentialSid = pushCredentialSid;
  } else {
    logger.warn('[twilio-client] missing TWILIO_PUSH_CREDENTIAL_SID_IOS; incoming client calls may fail');
  }
  const grant = new AccessToken.VoiceGrant(voiceGrantOptions);
  const token = new AccessToken(accountSid, apiKey, apiSecret, {
    identity,
    ttl: Number(ttlSeconds),
  });
  token.addGrant(grant);
  logger.info(
    `[twilio-client] token issued profile=${profileId} identity=${identity} hasPushCredentialSid=${Boolean(pushCredentialSid)} ttl=${ttlSeconds}`
  );

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

async function recordCallLifecycle(req: Request, res: Response) {
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

  const {
    callSid,
    callUuid,
    direction = 'incoming',
    state,
    fromNumber = null,
    toNumber = null,
    toClientIdentity = null,
    eventAt,
    metadata = {},
  } = req.body as {
    callSid: string;
    callUuid?: string;
    direction?: 'incoming' | 'outgoing';
    state: LifecycleState;
    fromNumber?: string | null;
    toNumber?: string | null;
    toClientIdentity?: string | null;
    eventAt?: string;
    metadata?: Record<string, unknown>;
  };

  const profile = await ensureProfile(profileId);
  if (!profile) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Profile not found' });
  }

  const parsedEventAt = eventAt ? new Date(eventAt) : new Date();
  const eventIso = Number.isNaN(parsedEventAt.getTime()) ? new Date().toISOString() : parsedEventAt.toISOString();

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('twilio_client_call_sessions')
    .select(
      'id, state, started_at, connected_at, ended_at, last_event_at, call_uuid, direction, from_number, to_number, to_client_identity'
    )
    .eq('profile_id', profileId)
    .eq('call_sid', callSid)
    .maybeSingle();

  if (existingError) {
    logger.err(existingError);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to read call session' });
  }

  if (existing?.last_event_at) {
    const previousAt = new Date(existing.last_event_at);
    if (!Number.isNaN(previousAt.getTime()) && previousAt.getTime() > new Date(eventIso).getTime()) {
      return res.status(HTTP_STATUS_CODES.Accepted).json({ ignored: true, reason: 'stale_event' });
    }
  }

  const startedAt = existing?.started_at ?? eventIso;
  const connectedAt =
    existing?.connected_at ?? (state === 'connected' || state === 'reconnecting' ? eventIso : null);
  const endedAt = existing?.ended_at ?? (terminalStates.has(state) ? eventIso : null);

  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from('twilio_client_call_sessions')
    .upsert(
      {
        profile_id: profileId,
        call_sid: callSid,
        call_uuid: callUuid ?? existing?.call_uuid ?? null,
        direction: existing?.direction ?? direction,
        from_number: fromNumber ?? existing?.from_number ?? null,
        to_number: toNumber ?? existing?.to_number ?? null,
        to_client_identity: toClientIdentity ?? existing?.to_client_identity ?? profile.twilio_client_identity ?? null,
        state,
        metadata,
        started_at: startedAt,
        connected_at: connectedAt,
        ended_at: endedAt,
        last_event_at: eventIso,
      },
      { onConflict: 'profile_id,call_sid' }
    )
    .select(
      'id, profile_id, call_sid, call_uuid, direction, from_number, to_number, to_client_identity, state, started_at, connected_at, ended_at, last_event_at'
    )
    .single();

  if (upsertError) {
    logger.err(upsertError);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to save call lifecycle' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ session: upserted });
}

async function getActiveCall(req: Request, res: Response) {
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

  const { data, error } = await supabaseAdmin
    .from('twilio_client_call_sessions')
    .select(
      'id, profile_id, call_sid, call_uuid, direction, from_number, to_number, to_client_identity, state, started_at, connected_at, ended_at, last_event_at'
    )
    .eq('profile_id', profileId)
    .order('last_event_at', { ascending: false })
    .limit(1);

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to fetch active call' });
  }

  const session = data?.[0];
  if (!session || !activeStates.has(session.state as LifecycleState)) {
    return res.status(HTTP_STATUS_CODES.Ok).json({ session: null });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ session });
}

export default {
  createClientToken,
  recordClientHeartbeat,
  recordCallLifecycle,
  getActiveCall,
};
