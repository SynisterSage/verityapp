import { authorizedFetch } from './backend';

export type DeviceTokenPayload = {
  profileId: string;
  expoPushToken: string;
  platform: string;
  locale?: string;
  metadata?: Record<string, unknown> | null;
};

export async function registerProfileDeviceToken(payload: DeviceTokenPayload) {
  return authorizedFetch(`/profiles/${payload.profileId}/device-tokens`, {
    method: 'POST',
    body: JSON.stringify({
      expoPushToken: payload.expoPushToken,
      platform: payload.platform,
      locale: payload.locale,
      metadata: payload.metadata,
    }),
  });
}
