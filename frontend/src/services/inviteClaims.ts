import { authorizedFetch } from './backend';

export type InviteClaimResolutionResponse = {
  eligible: boolean;
  token?: string;
  code: string;
  invite: {
    id: string;
    role: 'admin' | 'editor' | string;
  };
};

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

