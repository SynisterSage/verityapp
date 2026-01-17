import { authorizedFetch } from './backend';

export type TwilioClientTokenResponse = {
  token: string;
  identity: string;
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
