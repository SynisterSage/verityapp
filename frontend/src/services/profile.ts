import { authorizedFetch } from './backend';

export async function deleteProfile(profileId: string, pin: string) {
  await authorizedFetch(`/profiles/${profileId}`, {
    method: 'DELETE',
    body: JSON.stringify({ pin }),
  });
}

export async function exportProfileData(profileId: string, pin: string) {
  return authorizedFetch(`/profiles/${profileId}/export`, {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

export async function clearProfileRecords(profileId: string, pin: string) {
  return authorizedFetch(`/profiles/${profileId}/records`, {
    method: 'DELETE',
    body: JSON.stringify({ pin }),
  });
}

export async function verifyPasscode(profileId: string, pin: string) {
  return authorizedFetch(`/profiles/${profileId}/passcode/verify`, {
    method: 'POST',
    body: JSON.stringify({ pin }),
    skipUnauthorizedSignOut: true,
  });
}

export async function updateContactsPermission(profileId: string, enabled: boolean) {
  return authorizedFetch(`/profiles/${profileId}/contacts-permission`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}
