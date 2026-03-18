import { authorizedFetch } from './backend';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type InviteClaimResolutionResponse = {
  eligible: boolean;
  token?: string;
  code: string;
  invite: {
    id: string;
    role: 'admin' | 'editor' | string;
  };
};

const LAST_ACCEPTED_INVITE_KEY = 'app:last-accepted-invite-claim';
const RECENT_ACCEPT_WINDOW_MS = 30 * 60 * 1000;

function normalizeInviteCode(value?: string | null) {
  if (!value) {
    return '';
  }
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
}

export async function resolveInviteClaimToken(args: { token?: string; code?: string }) {
  const token = args.token?.trim();
  const code = args.code?.trim();

  const params = new URLSearchParams();
  if (token) {
    params.set('t', token);
  } else if (code) {
    params.set('code', code);
  }

  return authorizedFetch(`/profiles/invites/resolve-token?${params.toString()}`, {
    method: 'GET',
  }) as Promise<InviteClaimResolutionResponse>;
}

export async function markInviteClaimAccepted(code: string) {
  const normalizedCode = normalizeInviteCode(code);
  if (!normalizedCode) {
    return;
  }
  try {
    await AsyncStorage.setItem(
      LAST_ACCEPTED_INVITE_KEY,
      JSON.stringify({ code: normalizedCode, at: Date.now() })
    );
  } catch {
    // Best effort marker.
  }
}

export async function wasInviteClaimRecentlyAccepted(code: string) {
  const normalizedCode = normalizeInviteCode(code);
  if (!normalizedCode) {
    return false;
  }
  try {
    const raw = await AsyncStorage.getItem(LAST_ACCEPTED_INVITE_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw) as { code?: string; at?: number } | null;
    if (!parsed?.code || typeof parsed.at !== 'number') {
      return false;
    }
    const age = Date.now() - parsed.at;
    if (age < 0 || age > RECENT_ACCEPT_WINDOW_MS) {
      return false;
    }
    return normalizeInviteCode(parsed.code) === normalizedCode;
  } catch {
    return false;
  }
}
