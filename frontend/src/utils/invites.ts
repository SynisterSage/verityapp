const DEFAULT_INVITE_LINK_BASE_URL = 'https://verityprotect.com/invite';
const DEFAULT_APP_STORE_FALLBACK_URL = 'https://apps.apple.com/app/id6759526773';

type InviteLike = {
  id?: string | null;
  short_code?: string | null;
  claim_token?: string | null;
};

export function formatInviteCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const cleaned = trimmed.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (cleaned.length !== 8) {
    return trimmed;
  }
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

function resolveInviteToken(invite: InviteLike) {
  return (invite.short_code ?? invite.id ?? '').trim();
}

export function resolveInviteCode(invite: InviteLike) {
  return formatInviteCode(invite.short_code ?? invite.id ?? '');
}

export function buildInviteLink(invite: InviteLike, baseUrl = DEFAULT_INVITE_LINK_BASE_URL) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const claimToken = invite.claim_token?.trim();
  if (claimToken) {
    return `${normalizedBaseUrl}?t=${encodeURIComponent(claimToken)}`;
  }

  const token = resolveInviteToken(invite);
  return `${normalizedBaseUrl}/${encodeURIComponent(token)}`;
}

export function buildInviteShareMessage(
  invite: InviteLike,
  options?: {
    appStoreUrl?: string;
    inviteBaseUrl?: string;
  }
) {
  const appStoreUrl = options?.appStoreUrl ?? DEFAULT_APP_STORE_FALLBACK_URL;
  const code = resolveInviteCode(invite);
  const link = buildInviteLink(invite, options?.inviteBaseUrl);

  return `You're invited to join my Verity Protect Circle.\n\nOpen this invite:\n${link}\n\nIf the app isn't installed, install it here:\n${appStoreUrl}\n\nIf the invite doesn't open automatically, enter this code in the app:\n${code}`;
}

