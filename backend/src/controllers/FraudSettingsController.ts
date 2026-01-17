import { Request, Response } from 'express';
import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { hashCallerNumber } from '@src/services/fraud';
import { removeBlockedEntry, removeTrustedContact } from '@src/services/callerLists';

function normalizeCallerNumber(input?: string | null) {
  if (!input) {
    return null;
  }
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) {
    return null;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

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

async function userIsCaretaker(userId: string, profileId: string) {
  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', profileId)
    .maybeSingle();
  return profileRow?.caretaker_id === userId;
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

  await removeTrustedContact(profileId, callerHash);

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

async function listTrustedContacts(req: Request, res: Response) {
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
    .from('trusted_contacts')
    .select('id, caller_number, source, created_at, relationship_tag, contact_name, caller_hash')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to load trusted contacts' });
  }

  const seen = new Set<string>();
  const deduped = (data ?? []).filter((contact) => {
    const canonical = normalizeCallerNumber(contact.caller_number) ?? '';
    const key = canonical || contact.caller_hash || contact.caller_number;
    if (!key) {
      return false;
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return res.status(HTTP_STATUS_CODES.Ok).json({ trusted_contacts: deduped });
}

async function addTrustedContacts(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId, callerNumber, callerNumbers, source, contactNames } = req.body as {
    profileId?: string;
    callerNumber?: string;
    callerNumbers?: string[];
    source?: string;
    contactNames?: Record<string, string>;
  };

  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const allowed = await userIsCaretaker(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const rawNumbers = Array.isArray(callerNumbers)
    ? callerNumbers
    : callerNumber
      ? [callerNumber]
      : [];

  const normalizedNumbers = Array.from(
    new Set(
      rawNumbers
        .map((number) => normalizeCallerNumber(number))
        .filter((value): value is string => Boolean(value))
    )
  );

  const normalizedSource = source === 'contacts' ? 'contacts' : 'manual';
  const normalizedContactNames: Record<string, string> = {};
  Object.entries(contactNames ?? {}).forEach(([rawNumber, name]) => {
    const normalized = normalizeCallerNumber(rawNumber);
    if (normalized && name) {
      normalizedContactNames[normalized] = name;
    }
  });
  const { data: existingRows } = await supabaseAdmin
    .from('trusted_contacts')
    .select('caller_number')
    .eq('profile_id', profileId);
  const existingCanonicalNumbers = new Set<string>();
  (existingRows ?? []).forEach((row: { caller_number?: string | null }) => {
    const normalizedNumber = normalizeCallerNumber(row.caller_number || '');
    if (normalizedNumber) {
      existingCanonicalNumbers.add(normalizedNumber);
    }
  });
  const filteredNumbers = normalizedNumbers.filter(
    (number) => !existingCanonicalNumbers.has(number)
  );
  if (filteredNumbers.length === 0) {
    return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true, added: 0 });
  }
  const rows = filteredNumbers.map((normalizedNumber) => {
    const callerHash = hashCallerNumber(normalizedNumber);
    if (!callerHash) {
      return null;
    }
    const contactName = normalizedContactNames[normalizedNumber];
    return {
      profile_id: profileId,
      caller_hash: callerHash,
      caller_number: normalizedNumber,
      source: normalizedSource,
      contact_name: contactName?.trim() || null,
    };
  })
    .filter(Boolean) as {
      profile_id: string;
      caller_hash: string;
      caller_number: string;
      source: 'manual' | 'contacts';
      contact_name?: string | null;
    }[];

  if (rows.length === 0) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing callerNumber(s)' });
  }

  await Promise.all(rows.map((row) => removeBlockedEntry(row.profile_id, row.caller_hash)));

  const { error } = await supabaseAdmin
    .from('trusted_contacts')
    .upsert(rows, { onConflict: 'profile_id,caller_hash' });

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to add trusted contacts' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true, added: rows.length });
}

async function updateTrustedContact(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId, callerNumber, relationshipTag, contactName } = req.body as {
    profileId?: string;
    callerNumber?: string;
    relationshipTag?: string;
    contactName?: string;
  };

  if (!profileId || !callerNumber?.trim() || !relationshipTag?.trim()) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId, callerNumber, or relationshipTag' });
  }

  const allowed = await userIsCaretaker(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const trimmed = callerNumber.trim();
  const normalizedNumber = normalizeCallerNumber(trimmed);
  const candidates = Array.from(
    new Map(
      [normalizedNumber, trimmed]
        .filter((value): value is string => Boolean(value))
        .map((value) => {
          const hash = hashCallerNumber(value);
          return hash ? [hash, value] : null;
        })
        .filter((entry): entry is [string, string] => Boolean(entry))
    )
  );

  if (candidates.length === 0) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid callerNumber' });
  }

  const hashes = candidates.map(([hash]) => hash);
  const { data: existing } = await supabaseAdmin
    .from('trusted_contacts')
    .select('caller_hash')
    .eq('profile_id', profileId)
    .in('caller_hash', hashes)
    .limit(1)
    .maybeSingle();

  if (!existing) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Trusted contact not found' });
  }

  const callerHash = existing.caller_hash;

  const updates: Record<string, string> = {
    relationship_tag: relationshipTag.trim(),
  };
  if (contactName?.trim()) {
    updates.contact_name = contactName.trim();
  }

  const { error } = await supabaseAdmin
    .from('trusted_contacts')
    .update(updates)
    .eq('profile_id', profileId)
    .eq('caller_hash', callerHash);

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to update trusted contact' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

async function getCallerStatus(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId, callerNumber } = req.query as Record<string, string | undefined>;
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

  const [blockedRes, trustedRes] = await Promise.all([
    supabaseAdmin
      .from('blocked_callers')
      .select('id')
      .eq('profile_id', profileId)
      .eq('caller_hash', callerHash)
      .limit(1),
    supabaseAdmin
      .from('trusted_contacts')
      .select('id')
      .eq('profile_id', profileId)
      .eq('caller_hash', callerHash)
      .limit(1),
  ]);

  const blocked = (blockedRes.data ?? []).length > 0;
  const trusted = (trustedRes.data ?? []).length > 0;
  return res.status(HTTP_STATUS_CODES.Ok).json({ blocked, trusted });
}

async function deleteTrustedContact(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { trustedId } = req.params;
  if (!trustedId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing trustedId' });
  }

  const { data: row } = await supabaseAdmin
    .from('trusted_contacts')
    .select('profile_id')
    .eq('id', trustedId)
    .maybeSingle();

  if (!row) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Trusted contact not found' });
  }

  const allowed = await userIsCaretaker(userId, row.profile_id);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { error } = await supabaseAdmin
    .from('trusted_contacts')
    .delete()
    .eq('id', trustedId);

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to remove trusted contact' });
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
  listTrustedContacts,
  addTrustedContacts,
  deleteTrustedContact,
  updateTrustedContact,
  getCallerStatus,
};
