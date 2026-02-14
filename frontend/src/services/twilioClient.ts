import { authorizedFetch } from './backend';

export type TwilioClientTokenResponse = {
  token: string;
  identity: string;
};

export type TwilioClientCallLifecycleState =
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed'
  | 'ended';

export type TwilioClientCallLifecyclePayload = {
  callSid: string;
  callUuid?: string;
  direction?: 'incoming' | 'outgoing';
  state: TwilioClientCallLifecycleState;
  fromNumber?: string | null;
  toNumber?: string | null;
  toClientIdentity?: string | null;
  eventAt?: string;
  metadata?: Record<string, unknown>;
};

export type TwilioClientCallSession = {
  id: string;
  profile_id: string;
  call_sid: string;
  call_uuid: string | null;
  direction: 'incoming' | 'outgoing';
  from_number: string | null;
  to_number: string | null;
  to_client_identity: string | null;
  state: TwilioClientCallLifecycleState;
  started_at: string;
  connected_at: string | null;
  ended_at: string | null;
  last_event_at: string;
};

export async function requestTwilioClientToken(profileId: string) {
  return authorizedFetch(`/profiles/${profileId}/twilio-client/token`, {
    method: 'POST',
  }) as Promise<TwilioClientTokenResponse>;
}

export async function sendTwilioClientHeartbeat(profileId: string, identity: string) {
  return authorizedFetch(`/profiles/${profileId}/twilio-client/heartbeat`, {
    method: 'POST',
    body: JSON.stringify({ identity }),
  });
}

export async function recordTwilioClientCallLifecycle(
  profileId: string,
  payload: TwilioClientCallLifecyclePayload
) {
  return authorizedFetch(`/profiles/${profileId}/twilio-client/call-lifecycle`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ session: TwilioClientCallSession }>;
}

export async function fetchTwilioClientActiveCall(profileId: string) {
  return authorizedFetch(`/profiles/${profileId}/twilio-client/active-call`) as Promise<{
    session: TwilioClientCallSession | null;
  }>;
}
