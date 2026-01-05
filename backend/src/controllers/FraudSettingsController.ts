import { Request, Response } from 'express';
import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { hashCallerNumber } from '@src/services/fraud';

async function getAuthenticatedUserId(req: Request) {
  const authHeader = req.header('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length)
    : '';
  if (!token) {
    return '';
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return '';
  }
  return data.user.id;
}

async function userCanAccessProfile(userId: string, profileId: string) {
  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', profileId)
    .maybeSingle();

  if (!profileRow) {
    return false;
  }

  if (profileRow.caretaker_id === userId) {
    return true;
  }

  const { data: memberRow } = await supabaseAdmin
    .from('profile_members')
    .select('id')
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .maybeSingle();

  return !!memberRow;
}

async function listSafePhrases(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.query as Record<string, string | undefined>;
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const allowed = await userCanAccessProfile(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { data, error } = await supabaseAdmin
    .from('fraud_safe_phrases')
    .select('id, phrase, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to load safe phrases' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ safe_phrases: data ?? [] });
}

async function addSafePhrase(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId, phrase } = req.body as { profileId?: string; phrase?: string };
  if (!profileId || !phrase?.trim()) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId or phrase' });
  }

  const allowed = await userCanAccessProfile(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { error } = await supabaseAdmin
    .from('fraud_safe_phrases')
    .upsert({
      profile_id: profileId,
      phrase: phrase.trim().toLowerCase(),
      created_by_user_id: userId,
    }, { onConflict: 'profile_id,phrase' });

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to save phrase' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

async function deleteSafePhrase(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { phraseId } = req.params;
  if (!phraseId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing phraseId' });
  }

  const { data: row } = await supabaseAdmin
    .from('fraud_safe_phrases')
    .select('profile_id')
    .eq('id', phraseId)
    .maybeSingle();

  if (!row) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Phrase not found' });
  }

  const allowed = await userCanAccessProfile(userId, row.profile_id);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { error } = await supabaseAdmin
    .from('fraud_safe_phrases')
    .delete()
    .eq('id', phraseId);

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to delete phrase' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

async function listBlockedCallers(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.query as Record<string, string | undefined>;
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const allowed = await userCanAccessProfile(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { data, error } = await supabaseAdmin
    .from('blocked_callers')
    .select('id, caller_number, reason, blocked_until, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to load blocklist' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ blocked_callers: data ?? [] });
}

async function addBlockedCaller(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId, callerNumber, reason, blockedUntil } = req.body as {
    profileId?: string;
    callerNumber?: string;
    reason?: string;
    blockedUntil?: string;
  };

  if (!profileId || !callerNumber) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId or callerNumber' });
  }

  const allowed = await userCanAccessProfile(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const callerHash = hashCallerNumber(callerNumber);
  if (!callerHash) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid callerNumber' });
  }

  const { error } = await supabaseAdmin
    .from('blocked_callers')
    .upsert({
      profile_id: profileId,
      caller_hash: callerHash,
      caller_number: callerNumber,
      reason: reason ?? null,
      blocked_until: blockedUntil ?? null,
    }, { onConflict: 'profile_id,caller_hash' });

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to block caller' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

async function deleteBlockedCaller(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { blockId } = req.params;
  if (!blockId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing blockId' });
  }

  const { data: row } = await supabaseAdmin
    .from('blocked_callers')
    .select('profile_id')
    .eq('id', blockId)
    .maybeSingle();

  if (!row) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Block entry not found' });
  }

  const allowed = await userCanAccessProfile(userId, row.profile_id);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { error } = await supabaseAdmin
    .from('blocked_callers')
    .delete()
    .eq('id', blockId);

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to unblock caller' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

export default {
  listSafePhrases,
  addSafePhrase,
  deleteSafePhrase,
  listBlockedCallers,
  addBlockedCaller,
  deleteBlockedCaller,
};
