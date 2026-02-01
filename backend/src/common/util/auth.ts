import { Request } from 'express';
import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { RouteError } from './route-errors';

function extractBearerToken(req: Request) {
  const authHeader = req.header('authorization') ?? '';
  const match = authHeader.match(/^\s*Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
}

export async function getAuthenticatedUserId(req: Request) {
  const token = extractBearerToken(req);
  if (!token) {
    return null;
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return null;
  }
  return data.user.id;
}

export async function requireAuthenticatedUser(req: Request) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    throw new RouteError(HTTP_STATUS_CODES.Unauthorized, 'Unauthorized');
  }
  return userId;
}

async function getCaretakerId(profileId: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', profileId)
    .maybeSingle();
  return profile?.caretaker_id ?? null;
}

export async function userIsCaretaker(userId: string, profileId: string) {
  const caretakerId = await getCaretakerId(profileId);
  return caretakerId === userId;
}

export async function userHasRole(
  userId: string,
  profileId: string,
  role: 'admin' | 'editor'
) {
  if (role === 'admin' && (await userIsCaretaker(userId, profileId))) {
    return true;
  }
  const { data: membership } = await supabaseAdmin
    .from('profile_members')
    .select('role')
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .maybeSingle();
  return membership?.role === role;
}

export async function userCanAccessProfile(userId: string, profileId: string) {
  if (await userIsCaretaker(userId, profileId)) {
    return true;
  }
  const { data: member } = await supabaseAdmin
    .from('profile_members')
    .select('id')
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(member);
}

export function logProfileAccessDenied(
  action: string,
  userId?: string | null,
  profileId?: string,
  details?: Record<string, unknown>
) {
  const payload = {
    action,
    userId: userId ?? 'unknown',
    profileId: profileId ?? 'unknown',
    ...details,
  };
  logger.warn(`[Security] Access denied ${JSON.stringify(payload)}`);
}
