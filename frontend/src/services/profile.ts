import { authorizedFetch } from './backend';

export async function deleteProfile(profileId: string) {
  await authorizedFetch(`/profiles/${profileId}`, { method: 'DELETE' });
}

export async function exportProfileData(profileId: string) {
  return authorizedFetch(`/profiles/${profileId}/export`, { method: 'POST' });
}

export async function clearProfileRecords(profileId: string) {
  return authorizedFetch(`/profiles/${profileId}/records`, { method: 'DELETE' });
}

export async function verifyPasscode(profileId: string, pin: string) {
  return authorizedFetch(`/profiles/${profileId}/passcode/verify`, {
    method: 'POST',
    body: JSON.stringify({ pin }),
    skipUnauthorizedSignOut: true,
  });
}
