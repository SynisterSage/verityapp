import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import logger from 'jet-logger';

import { CURRENT_PEPPER_VERSION, hashPasscode, verifyCurrentPasscode, verifyLegacyPasscode } from '@src/services/passcode';
import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { generateUniqueShortCode } from '@src/common/helpers/invite';
import { getPinLockState, recordPinAttempt } from '@src/services/pinAttempts';
import {
  getAuthenticatedUserId,
  logProfileAccessDenied,
  userCanAccessProfile,
  userHasRole,
  userIsCaretaker,
} from '@src/common/util/auth';
import { recordCircleAlert } from '@src/services/circleAlerts';
import { sanitizeProfile, sanitizeProfiles, sanitizeErrorResponse } from '@src/middleware/dataSanitizer';

const INVITE_ROLES = ['admin', 'editor'] as const;
type MemberRole = (typeof INVITE_ROLES)[number];

function sanitizeProfileRow(row: Record<string, any>): Record<string, any> {
  if (!row) {
    return row;
  }
  const sanitized = {
    ...row,
    has_passcode: Boolean(row.pin_hash ?? row.passcode_hash),
    last_pin_update: row.pin_updated_at ?? null,
    pin_hash: undefined,
    passcode_hash: undefined,
    pin_salt: undefined,
    pin_locked_until: undefined,
    pin_updated_at: undefined,
  } as Record<string, any>;
  return sanitized;
}

async function listProfiles(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { data: caretakerProfiles } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, first_name, last_name, phone_number, twilio_virtual_number, pin_hash, pin_salt, passcode_hash, pin_locked_until, pin_updated_at, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud, created_at'
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
        'id, first_name, last_name, phone_number, twilio_virtual_number, pin_hash, pin_salt, passcode_hash, pin_locked_until, pin_updated_at, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud, created_at'
      )
      .in('id', memberIds);
    memberRows = data ?? [];
  }

  const profiles = [...(caretakerProfiles ?? []), ...(memberRows ?? [])]
    .map((row) => sanitizeProfileRow(row))
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
      'id, first_name, last_name, phone_number, twilio_virtual_number, pin_hash, pin_salt, passcode_hash, pin_locked_until, pin_updated_at, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud, created_at'
    )
    .single();

  if (error || !data) {
    logger.err(error ?? new Error('Failed to create profile'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to create profile' });
  }

  return res.status(HTTP_STATUS_CODES.Created).json({
    profile: sanitizeProfileRow(data),
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
  const isAdmin = await userHasRole(userId, profileId, 'admin');
  if (!isCaretaker && !isAdmin) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const hashed = await hashPasscode(pin);
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      pin_hash: hashed.hash,
      pin_salt: hashed.salt,
      pin_pepper_version: hashed.pepperVersion,
      pin_locked_until: null,
      pin_updated_at: new Date().toISOString(),
      passcode_hash: null,
    })
    .eq('id', profileId);

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to update passcode' });
  }

  try {
    const { data: memberRow } = await supabaseAdmin
      .from('profile_members')
      .select('display_name')
      .eq('profile_id', profileId)
      .eq('user_id', userId)
      .maybeSingle();
    const actorLabel =
      memberRow?.display_name ??
      (isCaretaker ? 'Circle owner' : 'Circle member');
    const payload = {
      actor_user_id: userId,
      actor_role: isCaretaker ? 'caretaker' : 'member',
      actor_label: actorLabel,
      message: 'Updated the Safety PIN',
    };
    await recordCircleAlert({
      profileId,
      alertType: 'pin_change',
      payload,
    });
  } catch (alertError) {
    logger.err(alertError);
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ message: 'Passcode updated' });
}

async function verifyPasscode(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params as { profileId: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const { pin } = req.body as { pin?: string };
  if (!pin) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing pin' });
  }

  const isCaretaker = await userIsCaretaker(userId, profileId);
  const isAdmin = await userHasRole(userId, profileId, 'admin');
  if (!isCaretaker && !isAdmin) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const clientIp = req.ip;
  const currentLockState = await getPinLockState(profileId, clientIp);
  if (currentLockState.locked) {
    return res.status(HTTP_STATUS_CODES.TooManyRequests).json({
      error: 'Too many passcode attempts. Try again later.',
      lockedUntil: currentLockState.lockedUntil?.toISOString() ?? null,
    });
  }

  const { data: profileRow, error } = await supabaseAdmin
    .from('profiles')
    .select('pin_hash, pin_pepper_version, passcode_hash')
    .eq('id', profileId)
    .maybeSingle();
  if (error || !profileRow) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to load profile' });
  }

  const pepperVersion = profileRow.pin_pepper_version ?? CURRENT_PEPPER_VERSION;
  const isValidPin =
    (profileRow.pin_hash &&
      (await verifyCurrentPasscode(pin, profileRow.pin_hash, pepperVersion))) ||
    verifyLegacyPasscode(pin, profileRow.passcode_hash ?? null);

  await recordPinAttempt(profileId, clientIp, isValidPin);

  if (!isValidPin) {
    const updatedLockState = await getPinLockState(profileId, clientIp);
    if (updatedLockState.locked) {
      return res.status(HTTP_STATUS_CODES.TooManyRequests).json({
        error: 'Too many passcode attempts. Try again later.',
        lockedUntil: updatedLockState.lockedUntil?.toISOString() ?? null,
      });
    }
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Invalid passcode' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ valid: true });
}

async function recordActivity(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params as { profileId: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const { alertType, payload, status } = req.body as {
    alertType?: string;
    payload?: Record<string, unknown>;
    status?: string;
  };

  if (!alertType) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing alertType' });
  }

  const isCaretaker = await userIsCaretaker(userId, profileId);
  const isAdmin = await userHasRole(userId, profileId, 'admin');
  if (!isCaretaker && !isAdmin) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const defaultLabel = isCaretaker ? 'Circle owner' : 'Circle member';
  const enrichedPayload = {
    actor_user_id: payload?.actor_user_id ?? userId,
    actor_role: payload?.actor_role ?? (isCaretaker ? 'caretaker' : 'admin'),
    actor_label: payload?.actor_label ?? defaultLabel,
    ...(payload ?? {}),
  };

  try {
    await recordCircleAlert({
      profileId,
      alertType,
      payload: enrichedPayload,
      status: status ?? 'resolved',
    });
    return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
  } catch (err) {
    logger.err(err);
    return res
      .status(HTTP_STATUS_CODES.InternalServerError)
      .json({ error: 'Failed to record activity' });
  }
}

async function updateAlertPrefs(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }
  const { profileId } = req.params as { profileId: string };

  // Allow if caretaker OR if user is a member of the profile
  const isCaretaker = await userIsCaretaker(userId, profileId);
  const isMember = isCaretaker || await userHasRole(userId, profileId, 'editor') || await userHasRole(userId, profileId, 'admin');
  
  if (!isMember) {
    logProfileAccessDenied('updateAlertPrefs', userId, profileId);
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

  // Get existing notification preferences from profile_members
  let { data: memberData, error: memberError } = await supabaseAdmin
    .from('profile_members')
    .select('notification_preferences')
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .maybeSingle();

  // If no profile_members row exists, create one (e.g., for legacy caretakers)
  if (!memberData && !memberError) {
    // Get caretaker_id from profiles
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('caretaker_id')
      .eq('id', profileId)
      .single();

    const caretakerId = profileData?.caretaker_id;
    if (!caretakerId) {
      logger.err(new Error('Profile missing caretaker_id'));
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to update alert prefs' });
    }

    // Insert profile_members row with default notification preferences
    const { data: newMember, error: insertError } = await supabaseAdmin
      .from('profile_members')
      .insert({
        profile_id: profileId,
        user_id: userId,
        caretaker_id: caretakerId,
        role: isCaretaker ? 'admin' : 'editor',
        notification_preferences: {
          enable_email_alerts: true,
          enable_sms_alerts: true,
          enable_push_alerts: true,
          alert_threshold_score: 50,
          auto_mark_enabled: false,
          auto_mark_fraud_threshold: 80,
          auto_mark_safe_threshold: 20,
          auto_trust_on_safe: false,
          auto_block_on_fraud: false,
        },
      })
      .select('notification_preferences')
      .single();

    if (insertError || !newMember) {
      logger.err(insertError ?? new Error('Failed to create profile_members row'));
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to update alert prefs' });
    }

    memberData = newMember;
  }

  if (memberError || !memberData) {
    logger.err(memberError ?? new Error('Failed to get member notification preferences'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to update alert prefs' });
  }

  const existingPrefs = memberData.notification_preferences || {};

  // Build updated notification_preferences object
  const updatedPrefs: Record<string, number | boolean> = { ...existingPrefs };
  if (typeof alert_threshold_score === 'number') {
    updatedPrefs.alert_threshold_score = alert_threshold_score;
  }
  if (typeof enable_email_alerts === 'boolean') {
    updatedPrefs.enable_email_alerts = enable_email_alerts;
  }
  if (typeof enable_sms_alerts === 'boolean') {
    updatedPrefs.enable_sms_alerts = enable_sms_alerts;
  }
  if (typeof enable_push_alerts === 'boolean') {
    updatedPrefs.enable_push_alerts = enable_push_alerts;
  }
  if (typeof auto_mark_enabled === 'boolean') {
    updatedPrefs.auto_mark_enabled = auto_mark_enabled;
  }
  if (typeof auto_mark_fraud_threshold === 'number') {
    updatedPrefs.auto_mark_fraud_threshold = auto_mark_fraud_threshold;
  }
  if (typeof auto_mark_safe_threshold === 'number') {
    updatedPrefs.auto_mark_safe_threshold = auto_mark_safe_threshold;
  }
  if (typeof auto_trust_on_safe === 'boolean') {
    updatedPrefs.auto_trust_on_safe = auto_trust_on_safe;
  }
  if (typeof auto_block_on_fraud === 'boolean') {
    updatedPrefs.auto_block_on_fraud = auto_block_on_fraud;
  }

  // Update profile_members with new notification_preferences
  const { data: updatedMember, error: updateError } = await supabaseAdmin
    .from('profile_members')
    .update({ notification_preferences: updatedPrefs })
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .select('notification_preferences')
    .single();

  if (updateError || !updatedMember) {
    logger.err(updateError ?? new Error('Failed to update alert prefs'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to update alert prefs' });
  }

  const automationChanges: string[] = [];
  if (typeof auto_mark_enabled === 'boolean') {
    const prev = Boolean(existingPrefs?.auto_mark_enabled);
    if (auto_mark_enabled !== prev) {
      automationChanges.push(
        auto_mark_enabled ? 'Automation filtering enabled' : 'Automation filtering disabled'
      );
    }
  }
  if (typeof auto_mark_fraud_threshold === 'number' && auto_mark_fraud_threshold !== existingPrefs?.auto_mark_fraud_threshold) {
    automationChanges.push(`Fraud threshold set to ${auto_mark_fraud_threshold}`);
  }
  if (typeof auto_mark_safe_threshold === 'number' && auto_mark_safe_threshold !== existingPrefs?.auto_mark_safe_threshold) {
    automationChanges.push(`Safe threshold set to ${auto_mark_safe_threshold}`);
  }
  if (typeof auto_trust_on_safe === 'boolean') {
    const prev = Boolean(existingPrefs?.auto_trust_on_safe);
    if (auto_trust_on_safe !== prev) {
      automationChanges.push(
        auto_trust_on_safe ? 'Auto-trust when safe enabled' : 'Auto-trust when safe disabled'
      );
    }
  }
  if (typeof auto_block_on_fraud === 'boolean') {
    const prev = Boolean(existingPrefs?.auto_block_on_fraud ?? true);
    if (auto_block_on_fraud !== prev) {
      automationChanges.push(
        auto_block_on_fraud ? 'Auto-block high risk calls enabled' : 'Auto-block high risk calls disabled'
      );
    }
  }

  if (automationChanges.length > 0) {
    try {
      await recordCircleAlert({
        profileId,
        alertType: 'automation_settings_updated',
        payload: {
          actor_user_id: userId,
          actor_role: isCaretaker ? 'caretaker' : 'member',
          actor_label: isCaretaker ? 'Circle owner' : 'Circle member',
          changes: automationChanges,
          message: automationChanges.join(' · '),
        },
      });
    } catch (alertError) {
      logger.err(alertError);
    }
  }

  // Fetch the profile to return (frontend expects profile object with notification fields)
  const { data: profileData, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, phone_number, twilio_virtual_number, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud, created_at')
    .eq('id', profileId)
    .single();

  if (profileError || !profileData) {
    logger.err(profileError ?? new Error('Failed to fetch profile'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to update alert prefs' });
  }

  // Merge notification_preferences from profile_members into profile response
  const profileWithPrefs = {
    ...profileData,
    alert_threshold_score: updatedPrefs.alert_threshold_score,
    enable_email_alerts: updatedPrefs.enable_email_alerts,
    enable_sms_alerts: updatedPrefs.enable_sms_alerts,
    enable_push_alerts: updatedPrefs.enable_push_alerts,
    auto_mark_enabled: updatedPrefs.auto_mark_enabled,
    auto_mark_fraud_threshold: updatedPrefs.auto_mark_fraud_threshold,
    auto_mark_safe_threshold: updatedPrefs.auto_mark_safe_threshold,
    auto_trust_on_safe: updatedPrefs.auto_trust_on_safe,
    auto_block_on_fraud: updatedPrefs.auto_block_on_fraud,
  };

  return res.status(HTTP_STATUS_CODES.Ok).json({
    profile: sanitizeProfileRow(profileWithPrefs),
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

  const isCaretaker = await userIsCaretaker(userId, profileId);
  const isAdmin = await userHasRole(userId, profileId, 'admin');
  const allowed = isCaretaker || isAdmin;
  if (!allowed) {
    logProfileAccessDenied('clearProfileRecords', userId, profileId);
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
      'id, first_name, last_name, phone_number, twilio_virtual_number, pin_hash, pin_salt, passcode_hash, pin_locked_until, pin_updated_at, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, created_at'
    )
    .single();

  if (error || !data) {
    logger.err(error ?? new Error('Failed to update profile'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to update profile' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({
    profile: sanitizeProfileRow(data),
  });
}

async function getProfile(req: Request, res: Response) {
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

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, first_name, last_name, phone_number, twilio_virtual_number, pin_hash, pin_salt, passcode_hash, pin_locked_until, pin_updated_at, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud, created_at'
    )
    .eq('id', profileId)
    .maybeSingle();

  if (error || !data) {
    logger.err(error ?? new Error('Failed to fetch profile'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to fetch profile' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({
    profile: sanitizeProfileRow(data),
  });
}

async function exportProfileData(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params as { profileId: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const isCaretaker = await userIsCaretaker(userId, profileId);
  const isAdmin = await userHasRole(userId, profileId, 'admin');
  const allowed = isCaretaker || isAdmin;
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const [
    { data: profileRow, error: profileError },
    { data: calls, error: callsError },
    { data: alerts, error: alertsError },
    { data: trustedContacts, error: trustedError },
    { data: safePhrases, error: safePhrasesError },
  ] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select(
        'id, first_name, last_name, phone_number, twilio_virtual_number, pin_hash, pin_salt, passcode_hash, pin_locked_until, pin_updated_at, alert_threshold_score, enable_email_alerts, enable_sms_alerts, enable_push_alerts, auto_mark_enabled, auto_mark_fraud_threshold, auto_mark_safe_threshold, auto_trust_on_safe, auto_block_on_fraud, created_at'
      )
      .eq('id', profileId)
      .maybeSingle(),
    supabaseAdmin
      .from('calls')
      .select('*')
      .eq('profile_id', profileId),
    supabaseAdmin
      .from('alerts')
      .select('*')
      .eq('profile_id', profileId),
    supabaseAdmin
      .from('trusted_contacts')
      .select('*')
      .eq('profile_id', profileId),
    supabaseAdmin
      .from('fraud_safe_phrases')
      .select('*')
      .eq('profile_id', profileId),
  ]);

  if (profileError || !profileRow) {
    logger.err(profileError ?? new Error('Failed to load profile for export'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to load profile' });
  }

  if (callsError || alertsError || trustedError || safePhrasesError) {
    logger.err(callsError ?? alertsError ?? trustedError ?? safePhrasesError);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({
      error: 'Failed to gather export data, please try again later',
    });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({
    profile: sanitizeProfileRow(profileRow),
    calls: calls ?? [],
    alerts: alerts ?? [],
    trusted_contacts: trustedContacts ?? [],
    safe_phrases: safePhrases ?? [],
  });
}

async function clearProfileRecords(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params as { profileId: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const isCaretaker = await userIsCaretaker(userId, profileId);
  const isAdmin = await userHasRole(userId, profileId, 'admin');
  const allowed = isCaretaker || isAdmin;
  if (!allowed) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const [{ error: callsError }, { error: alertsError }] = await Promise.all([
    supabaseAdmin.from('calls').delete().eq('profile_id', profileId),
    supabaseAdmin.from('alerts').delete().eq('profile_id', profileId),
  ]);

  if (callsError || alertsError) {
    logger.err(callsError ?? alertsError);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({
      error: 'Failed to clear records, please try again later',
    });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
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
    logProfileAccessDenied('deleteProfile', userId, profileId);
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

  const isAuthorizedToInvite = await userHasRole(userId, profileId, 'admin');
  if (!isAuthorizedToInvite) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const allowedRoles: MemberRole[] = [...INVITE_ROLES];
  if (role && !allowedRoles.includes(role as MemberRole)) {
    return res
      .status(HTTP_STATUS_CODES.Forbidden)
      .json({ error: 'Insufficient permissions for requested role' });
  }

  const memberRole: MemberRole =
    role && allowedRoles.includes(role as MemberRole) ? (role as MemberRole) : 'editor';

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

  const inviteShortCode = (await generateUniqueShortCode()) ?? undefined;
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
        short_code: inviteShortCode,
      },
      { onConflict: 'profile_id,email' }
    )
    .select('id, profile_id, email, role, status, created_at, short_code')
    .single();

  if (error || !data) {
    logger.err(error ?? new Error('Failed to create invite'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to create invite' });
  }

  try {
    await recordCircleAlert({
      profileId,
      alertType: 'circle_invite',
      payload: {
        actor_user_id: userId,
        actor_role: 'caretaker',
        actor_label: 'Circle owner',
        invite_email: inviteEmail,
        invite_role: memberRole,
        message: `Shared an invite link for role ${memberRole}.`,
      },
    });
  } catch (alertError) {
    logger.err(alertError);
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
    .select('id, email, role, status, created_at, accepted_at, short_code, invited_by')
    .eq('profile_id', profileId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const invitesData = data ?? [];
  const shortCodeUpdates: Array<{ id: string; code: string }> = [];
  const invitesWithCode = [];
  for (const invite of invitesData) {
    if (invite.short_code) {
      invitesWithCode.push(invite);
      continue;
    }
    const generated = (await generateUniqueShortCode()) ?? invite.id.slice(0, 8).toUpperCase();
    shortCodeUpdates.push({ id: invite.id, code: generated });
    invitesWithCode.push({ ...invite, short_code: generated });
  }

  if (shortCodeUpdates.length > 0) {
    await Promise.all(
      shortCodeUpdates.map((row) =>
        supabaseAdmin.from('profile_invites').update({ short_code: row.code }).eq('id', row.id)
      )
    );
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ invites: invitesWithCode });
}

async function revokeInvite(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }
  const { profileId, inviteId } = req.params as { profileId: string; inviteId: string };
  if (!profileId || !inviteId) {
    return res
      .status(HTTP_STATUS_CODES.BadRequest)
      .json({ error: 'Missing profileId or inviteId' });
  }

  const isCaretaker = await userIsCaretaker(userId, profileId);

  const { data: invite } = await supabaseAdmin
    .from('profile_invites')
    .select('id, status, invited_by')
    .eq('profile_id', profileId)
    .or(`id.eq.${inviteId},short_code.eq.${inviteId}`)
    .maybeSingle();
  if (!invite || invite.status !== 'pending') {
    return res
      .status(HTTP_STATUS_CODES.NotFound)
      .json({ error: 'Invite not found or already handled' });
  }

  if (!isCaretaker && invite.invited_by !== userId) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { error } = await supabaseAdmin
    .from('profile_invites')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', invite.id);

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to revoke invite' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ revoked: invite.id });
}

export default {
  listProfiles,
  createProfile,
  setPasscode,
  verifyPasscode,
  recordActivity,
  updateAlertPrefs,
  updateProfile,
  getProfile,
  exportProfileData,
  clearProfileRecords,
  deleteProfile,
  inviteMember,
  listInvites,
  revokeInvite,
};
