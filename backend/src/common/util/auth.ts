import { Request } from 'express';

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
