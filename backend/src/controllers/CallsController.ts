import { Request, Response } from 'express';
import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { removeBlockedEntry, removeTrustedContact } from '@src/services/callerLists';

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

const allowedStatuses = new Set(['marked_safe', 'marked_fraud', 'reviewed', 'archived']);

type AuthorizedCallRow = {
  profile_id: string | null;
  caller_number: string | null;
  caller_hash: string | null;
};

type AuthorizedProfileRow = {
  caretaker_id?: string | null;
  auto_mark_enabled?: boolean | null;
  auto_block_on_fraud?: boolean | null;
  auto_trust_on_safe?: boolean | null;
};

type CallAccessSuccess = {
  callRow: AuthorizedCallRow;
  profileRow: AuthorizedProfileRow;
};

type CallAccessFailure = {
  status: number;
  message: string;
};

async function authorizeCallAccess(callId: string, userId: string): Promise<CallAccessSuccess | CallAccessFailure> {
  const { data: callRow, error: callError } = await supabaseAdmin
    .from('calls')
    .select('profile_id, caller_number, caller_hash')
    .eq('id', callId)
    .single();

  if (callError || !callRow?.profile_id) {
    return { status: HTTP_STATUS_CODES.NotFound, message: 'Call not found' };
  }

  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(
      'caretaker_id, auto_mark_enabled, auto_block_on_fraud, auto_trust_on_safe'
    )
    .eq('id', callRow.profile_id)
    .maybeSingle();

  if (profileError || !profileRow) {
    return { status: HTTP_STATUS_CODES.Forbidden, message: 'Forbidden' };
  }

  const isCaretaker = profileRow.caretaker_id === userId;
  if (!isCaretaker) {
    const { data: memberRow } = await supabaseAdmin
      .from('profile_members')
      .select('id')
      .eq('profile_id', callRow.profile_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!memberRow) {
      return { status: HTTP_STATUS_CODES.Forbidden, message: 'Forbidden' };
    }
  }

  return { callRow, profileRow };
}

/**
 * Return a signed URL for a call recording.
 * Note: This endpoint is unauthenticated; add auth before production use.
 */
async function getRecordingUrl(req: Request, res: Response) {
  const { callId } = req.params;
  if (!callId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing callId' });
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { data: callRow, error: callError } = await supabaseAdmin
    .from('calls')
    .select('storage_path, profile_id')
    .eq('id', callId)
    .single();

  if (callError || !callRow?.storage_path || !callRow.profile_id) {
    logger.warn(`Recording not found for callId=${callId}`);
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Recording not found' });
  }

  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', callRow.profile_id)
    .single();

  if (profileError || !profileRow) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const isCaretaker = profileRow.caretaker_id === userId;
  let isMember = false;
  if (!isCaretaker) {
    const { data: memberRow } = await supabaseAdmin
      .from('profile_members')
      .select('id')
      .eq('profile_id', callRow.profile_id)
      .eq('user_id', userId)
      .maybeSingle();
    isMember = !!memberRow;
  }

  if (!isCaretaker && !isMember) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { data, error } = await supabaseAdmin.storage
    .from('call-recordings')
    .createSignedUrl(callRow.storage_path, 3600);

  if (error || !data?.signedUrl) {
    logger.err(`Signed URL creation failed: ${error?.message ?? 'unknown error'}`);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to sign URL' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({
    url: data.signedUrl,
    expires_in: 3600,
  });
}

async function submitFeedback(req: Request, res: Response) {
  const { callId } = req.params;
  if (!callId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing callId' });
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { status, notes } = req.body as { status?: string; notes?: string };
  if (!status || !allowedStatuses.has(status)) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid status' });
  }

  const access = await authorizeCallAccess(callId, userId);
  if ('status' in access) {
    return res.status(access.status).json({ error: access.message });
  }

  const { callRow, profileRow } = access;

  const { error: updateError } = await supabaseAdmin
    .from('calls')
    .update({
      feedback_status: status,
      feedback_notes: notes ?? null,
      feedback_by_user_id: userId,
      feedback_at: new Date().toISOString(),
    })
    .eq('id', callId);

  if (updateError) {
    logger.err(updateError);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to save feedback' });
  }

  const automationEnabled = profileRow.auto_mark_enabled === true;
  const automationBlockEnabled =
    automationEnabled && (profileRow.auto_block_on_fraud ?? true);
  const automationTrustEnabled =
    automationEnabled && (profileRow.auto_trust_on_safe ?? false);

  if (
    status === 'marked_fraud' &&
    automationBlockEnabled &&
    callRow.caller_hash &&
    callRow.profile_id
  ) {
    await removeTrustedContact(callRow.profile_id, callRow.caller_hash);
    const { error: blockError } = await supabaseAdmin.from('blocked_callers').upsert(
      {
        profile_id: callRow.profile_id,
        caller_hash: callRow.caller_hash,
        caller_number: callRow.caller_number || null,
        reason: 'auto_mark_fraud_manual',
      },
      { onConflict: 'profile_id,caller_hash' }
    );
    if (blockError) {
      logger.err(blockError);
    }
  }

  if (
    status === 'marked_safe' &&
    automationTrustEnabled &&
    callRow.caller_hash &&
    callRow.caller_number &&
    callRow.profile_id
  ) {
    await removeBlockedEntry(callRow.profile_id, callRow.caller_hash);
    const { error: trustError } = await supabaseAdmin.from('trusted_contacts').upsert(
      {
        profile_id: callRow.profile_id,
        caller_hash: callRow.caller_hash,
        caller_number: callRow.caller_number,
        source: 'auto',
      },
      { onConflict: 'profile_id,caller_hash' }
    );
    if (trustError) {
      logger.err(trustError);
    }
  }

  const alertTypeUpdate =
    status === 'marked_safe' ? 'safe' : status === 'marked_fraud' ? 'fraud' : undefined;
  const { error: alertUpdateError } = await supabaseAdmin
    .from('alerts')
    .update({
      status: 'resolved',
      ...(alertTypeUpdate ? { alert_type: alertTypeUpdate } : {}),
    })
    .eq('call_id', callId)
    .eq('profile_id', callRow.profile_id);

  if (alertUpdateError) {
    logger.err(alertUpdateError);
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

async function deleteCall(req: Request, res: Response) {
  const { callId } = req.params;
  if (!callId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing callId' });
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const access = await authorizeCallAccess(callId, userId);
  if ('status' in access) {
    return res.status(access.status).json({ error: access.message });
  }

  const { error: deleteError } = await supabaseAdmin
    .from('calls')
    .delete()
    .eq('id', callId);

  if (deleteError) {
    logger.err(deleteError);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to delete call' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

export default {
  getRecordingUrl,
  submitFeedback,
  deleteCall,
};
