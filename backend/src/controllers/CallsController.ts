import { Request, Response } from 'express';
import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

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
  const allowedStatuses = new Set(['marked_safe', 'marked_fraud', 'reviewed']);
  if (!status || !allowedStatuses.has(status)) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid status' });
  }

  const { data: callRow, error: callError } = await supabaseAdmin
    .from('calls')
    .select('profile_id')
    .eq('id', callId)
    .single();

  if (callError || !callRow?.profile_id) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Call not found' });
  }

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', callRow.profile_id)
    .maybeSingle();

  if (!profileRow) {
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

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

export default {
  getRecordingUrl,
  submitFeedback,
};
