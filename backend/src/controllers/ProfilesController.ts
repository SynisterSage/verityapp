import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import logger from 'jet-logger';

import { hashPasscode } from '@src/services/passcode';
import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

async function getAuthenticatedUserId(req: Request) {
  const authHeader = req.header('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length)
    : null;
  if (!token) {
    return null;
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return null;
  }
  return data.user.id;
}

async function userIsCaretaker(userId: string, profileId: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', profileId)
    .single();
  return profile?.caretaker_id === userId;
}

async function userCanAccessProfile(userId: string, profileId: string) {
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

async function listProfiles(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { data: caretakerProfiles } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, first_name, last_name, phone_number, twilio_virtual_number, passcode_hash, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud, created_at'
    )
    .eq('caretaker_id', userId);

  const { data: memberProfiles } = await supabaseAdmin
    .from('profile_members')
    .select('profile_id')
    .eq('user_id', userId);

  const memberIds = memberProfiles?.map((row) => row.profile_id) ?? [];
  let memberRows: typeof caretakerProfiles = [];
  if (memberIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select(
        'id, first_name, last_name, phone_number, twilio_virtual_number, passcode_hash, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud, created_at'
      )
      .in('id', memberIds);
    memberRows = data ?? [];
  }

  const profiles = [...(caretakerProfiles ?? []), ...(memberRows ?? [])]
    .map((row) => ({
      ...row,
      has_passcode: Boolean((row as { passcode_hash?: string | null }).passcode_hash),
      passcode_hash: undefined,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return res.status(HTTP_STATUS_CODES.Ok).json({ profiles });
}

async function createProfile(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const {
    first_name,
    last_name,
    phone_number,
    twilio_virtual_number,
    alert_threshold_score,
    enable_email_alerts,
    enable_sms_alerts,
    enable_push_alerts,
    auto_mark_enabled,
    auto_mark_fraud_threshold,
    auto_mark_safe_threshold,
    auto_trust_on_safe,
    auto_block_on_fraud,
  } = req.body as Record<string, string | number | boolean | undefined>;

  if (!first_name || !last_name) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing first_name or last_name' });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert({
      caretaker_id: userId,
      first_name,
      last_name,
      phone_number: phone_number ?? null,
      twilio_virtual_number: twilio_virtual_number ?? null,
      alert_threshold_score: typeof alert_threshold_score === 'number' ? alert_threshold_score : undefined,
      enable_email_alerts:
        typeof enable_email_alerts === 'boolean' ? enable_email_alerts : undefined,
      enable_sms_alerts: typeof enable_sms_alerts === 'boolean' ? enable_sms_alerts : undefined,
      enable_push_alerts:
        typeof enable_push_alerts === 'boolean' ? enable_push_alerts : undefined,
      auto_mark_enabled: typeof auto_mark_enabled === 'boolean' ? auto_mark_enabled : undefined,
      auto_mark_fraud_threshold:
        typeof auto_mark_fraud_threshold === 'number' ? auto_mark_fraud_threshold : undefined,
      auto_mark_safe_threshold:
        typeof auto_mark_safe_threshold === 'number' ? auto_mark_safe_threshold : undefined,
      auto_trust_on_safe: typeof auto_trust_on_safe === 'boolean' ? auto_trust_on_safe : undefined,
      auto_block_on_fraud:
        typeof auto_block_on_fraud === 'boolean' ? auto_block_on_fraud : undefined,
    })
    .select(
      'id, first_name, last_name, phone_number, twilio_virtual_number, passcode_hash, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud, created_at'
    )
    .single();

  if (error || !data) {
    logger.err(error ?? new Error('Failed to create profile'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to create profile' });
  }

  return res.status(HTTP_STATUS_CODES.Created).json({
    profile: {
      ...data,
      has_passcode: Boolean(data.passcode_hash),
      passcode_hash: undefined,
    },
  });
}

async function setPasscode(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }
  const { profileId } = req.params as { profileId: string };
  const { pin } = req.body as { pin?: string };

  if (!profileId || !pin || !/^\d{6}$/.test(pin)) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid pin' });
  }

  const isCaretaker = await userIsCaretaker(userId, profileId);
  if (!isCaretaker) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const passcode_hash = hashPasscode(pin);
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ passcode_hash })
    .eq('id', profileId);

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to update passcode' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ message: 'Passcode updated' });
}

async function updateAlertPrefs(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }
  const { profileId } = req.params as { profileId: string };

  const allowed = await userIsCaretaker(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const {
    alert_threshold_score,
    enable_email_alerts,
    enable_sms_alerts,
    enable_push_alerts,
    auto_mark_enabled,
    auto_mark_fraud_threshold,
    auto_mark_safe_threshold,
    auto_trust_on_safe,
    auto_block_on_fraud,
  } = req.body as Record<string, number | boolean | undefined>;

  const updates: Record<string, number | boolean> = {};
  if (typeof alert_threshold_score === 'number') {
    updates.alert_threshold_score = alert_threshold_score;
  }
  if (typeof enable_email_alerts === 'boolean') {
    updates.enable_email_alerts = enable_email_alerts;
  }
  if (typeof enable_sms_alerts === 'boolean') {
    updates.enable_sms_alerts = enable_sms_alerts;
  }
  if (typeof enable_push_alerts === 'boolean') {
    updates.enable_push_alerts = enable_push_alerts;
  }
  if (typeof auto_mark_enabled === 'boolean') {
    updates.auto_mark_enabled = auto_mark_enabled;
  }
  if (typeof auto_mark_fraud_threshold === 'number') {
    updates.auto_mark_fraud_threshold = auto_mark_fraud_threshold;
  }
  if (typeof auto_mark_safe_threshold === 'number') {
    updates.auto_mark_safe_threshold = auto_mark_safe_threshold;
  }
  if (typeof auto_trust_on_safe === 'boolean') {
    updates.auto_trust_on_safe = auto_trust_on_safe;
  }
  if (typeof auto_block_on_fraud === 'boolean') {
    updates.auto_block_on_fraud = auto_block_on_fraud;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', profileId)
    .select(
      'id, first_name, last_name, phone_number, twilio_virtual_number, passcode_hash, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud, created_at'
    )
    .single();

  if (error || !data) {
    logger.err(error ?? new Error('Failed to update alert prefs'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to update alert prefs' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({
    profile: {
      ...data,
      has_passcode: Boolean(data.passcode_hash),
      passcode_hash: undefined,
    },
  });
}

async function updateProfile(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params as { profileId: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const allowed = await userIsCaretaker(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { first_name, last_name, phone_number } = req.body as {
    first_name?: string;
    last_name?: string;
    phone_number?: string | null;
  };

  const updates: Record<string, string | null> = {};
  if (typeof first_name === 'string') {
    updates.first_name = first_name.trim();
  }
  if (typeof last_name === 'string') {
    updates.last_name = last_name.trim();
  }
  if (typeof phone_number !== 'undefined') {
    updates.phone_number = phone_number ? phone_number.trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'No updates provided' });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', profileId)
    .select(
      'id, first_name, last_name, phone_number, twilio_virtual_number, passcode_hash, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, created_at'
    )
    .single();

  if (error || !data) {
    logger.err(error ?? new Error('Failed to update profile'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to update profile' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({
    profile: {
      ...data,
      has_passcode: Boolean(data.passcode_hash),
      passcode_hash: undefined,
    },
  });
}

async function deleteProfile(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params as { profileId: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const allowed = await userIsCaretaker(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('id', profileId);

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to delete profile' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
}

async function inviteMember(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }
  const { profileId } = req.params as { profileId: string };
  const { email, role } = req.body as { email?: string; role?: string };
  const normalizedEmail = email?.trim().toLowerCase();
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const isCaretaker = await userIsCaretaker(userId, profileId);
  if (!isCaretaker) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const memberRole =
    role && ['admin', 'editor', 'viewer'].includes(role) ? role : 'viewer';

  const { data: existingUserRow, error: existingUserError } = normalizedEmail
    ? await supabaseAdmin
        .from('auth.users')
        .select('id, email')
        .eq('email', normalizedEmail)
        .maybeSingle()
    : { data: null, error: null };

  if (existingUserError) {
    logger.err(existingUserError);
  }

  if (existingUserRow?.id) {
    const { data, error } = await supabaseAdmin
      .from('profile_members')
      .upsert(
        {
          profile_id: profileId,
          user_id: existingUserRow.id,
          role: memberRole,
        },
        { onConflict: 'profile_id,user_id' }
      )
      .select('id, profile_id, user_id, role, created_at')
      .single();
    if (error || !data) {
      logger.err(error ?? new Error('Failed to add member'));
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to add member' });
    }
    return res.status(HTTP_STATUS_CODES.Ok).json({ member: data, status: 'member' });
  }

  const inviteEmail = normalizedEmail ?? `sms-invite-${randomUUID()}@verityprotect.sms`;
  const { data, error } = await supabaseAdmin
    .from('profile_invites')
    .upsert(
      {
        profile_id: profileId,
        email: inviteEmail,
        role: memberRole,
        invited_by: userId,
        status: 'pending',
      },
      { onConflict: 'profile_id,email' }
    )
    .select('id, profile_id, email, role, status, created_at')
    .single();

  if (error || !data) {
    logger.err(error ?? new Error('Failed to create invite'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to create invite' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ invite: data, status: 'pending' });
}

async function listInvites(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }
  const { profileId } = req.params as { profileId: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }
  const allowed = await userCanAccessProfile(userId, profileId);
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { data } = await supabaseAdmin
    .from('profile_invites')
    .select('id, email, role, status, created_at, accepted_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  return res.status(HTTP_STATUS_CODES.Ok).json({ invites: data ?? [] });
}

export default {
  listProfiles,
  createProfile,
  setPasscode,
  updateAlertPrefs,
  updateProfile,
  deleteProfile,
  inviteMember,
  listInvites,
};
