import { authorizedFetch } from './backend';

export type PinResetRequest = {
  id: string;
  profile_id: string;
  requester_user_id?: string | null;
  requester_name?: string | null;
  requester_role?: string | null;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'completed';
  message?: string | null;
  approver_user_id?: string | null;
  approved_at?: string | null;
  denied_at?: string | null;
  completed_at?: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export async function listPinResetRequests(profileId: string) {
  return authorizedFetch(`/profiles/${profileId}/pin-reset-requests`) as Promise<{ requests: PinResetRequest[] }>;
}

export async function createPinResetRequest(profileId: string, message?: string) {
  return authorizedFetch(`/profiles/${profileId}/pin-reset-requests`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  }) as Promise<{ request: PinResetRequest }>;
}

export async function approvePinResetRequest(profileId: string, requestId: string) {
  return authorizedFetch(`/profiles/${profileId}/pin-reset-requests/${requestId}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  }) as Promise<{ request: PinResetRequest }>;
}

export async function denyPinResetRequest(profileId: string, requestId: string) {
  return authorizedFetch(`/profiles/${profileId}/pin-reset-requests/${requestId}/deny`, {
    method: 'POST',
    body: JSON.stringify({}),
  }) as Promise<{ request: PinResetRequest }>;
}

export async function completePinResetRequest(profileId: string, requestId: string) {
  return authorizedFetch(`/profiles/${profileId}/pin-reset-requests/${requestId}/complete`, {
    method: 'POST',
    body: JSON.stringify({}),
  }) as Promise<{ request: PinResetRequest }>;
}
