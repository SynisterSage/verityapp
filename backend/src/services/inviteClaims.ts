import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

import { formatShortCode } from '@src/common/helpers/invite';

const INVITE_CLAIM_TOKEN_ISSUER = 'verityprotect';
const INVITE_CLAIM_TOKEN_AUDIENCE = 'invite-claim';
const DEFAULT_INVITE_CLAIM_TOKEN_TTL = '180d';

interface InviteClaimTokenPayload extends JwtPayload {
  inviteId?: string;
  inviteCode?: string | null;
}

function normalizeInviteCode(value: string | null | undefined) {
  const cleaned = (value ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (cleaned.length !== 8) {
    return null;
  }
  return formatShortCode(cleaned);
}

function getInviteClaimTokenSecret() {
  const secret = process.env.INVITE_CLAIM_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error('INVITE_CLAIM_TOKEN_SECRET is not configured');
  }
  return secret;
}

export function createInviteClaimToken(args: {
  inviteId: string;
  inviteCode?: string | null;
  expiresIn?: string;
}) {
  const inviteId = args.inviteId?.trim();
  if (!inviteId) {
    throw new Error('Cannot create invite claim token without an invite ID');
  }

  const inviteCode = normalizeInviteCode(args.inviteCode);

  return jwt.sign(
    {
      inviteId,
      inviteCode,
    },
    getInviteClaimTokenSecret(),
    {
      algorithm: 'HS256',
      issuer: INVITE_CLAIM_TOKEN_ISSUER,
      audience: INVITE_CLAIM_TOKEN_AUDIENCE,
      expiresIn: (args.expiresIn ??
        process.env.INVITE_CLAIM_TOKEN_TTL ??
        DEFAULT_INVITE_CLAIM_TOKEN_TTL) as SignOptions['expiresIn'],
    }
  );
}

export function parseInviteClaimToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const decoded = jwt.verify(trimmed, getInviteClaimTokenSecret(), {
      algorithms: ['HS256'],
      issuer: INVITE_CLAIM_TOKEN_ISSUER,
      audience: INVITE_CLAIM_TOKEN_AUDIENCE,
    }) as InviteClaimTokenPayload | string;

    if (!decoded || typeof decoded === 'string') {
      return null;
    }

    const inviteId = typeof decoded.inviteId === 'string' ? decoded.inviteId.trim() : '';
    if (!inviteId) {
      return null;
    }

    return {
      inviteId,
      inviteCode: normalizeInviteCode(decoded.inviteCode ?? null),
    };
  } catch {
    return null;
  }
}
