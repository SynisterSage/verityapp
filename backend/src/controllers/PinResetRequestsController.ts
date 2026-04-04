import { Request, Response } from 'express';
import logger from 'jet-logger';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import supabaseAdmin from '@src/services/supabase';
import { sendEmail } from '@src/services/email';
import { notifyUsersForPinReset } from '@src/services/pushNotifications';
import {
  getAuthenticatedUserId,
  logProfileAccessDenied,
  userCanAccessProfile,
  userHasRole,
  userIsCaretaker,
} from '@src/common/util/auth';

const REQUEST_EXPIRY_DAYS = 3;

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function readBooleanPref(value: unknown, key: string): boolean | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const enabled = (value as Record<string, unknown>)[key];
  return typeof enabled === 'boolean' ? enabled : null;
}

function buildProfileLabel(profile: { first_name?: string | null; last_name?: string | null }) {
  const first = profile.first_name?.trim() ?? '';
  const last = profile.last_name?.trim() ?? '';
  const combined = `${first} ${last}`.trim();
  return combined || 'this profile';
}

async function resolveUserEmail(userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    logger.warn(`Failed to resolve user email: ${error?.message ?? String(error)}`);
    return null;
  }
  return data?.user?.email ?? null;
}

async function resolveRequesterInfo(userId: string, profileId: string) {
  const { data: memberRow } = await supabaseAdmin
    .from('profile_members')
    .select('display_name, role')
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .maybeSingle();

  const isCaretaker = await userIsCaretaker(userId, profileId);
  const role = isCaretaker ? 'owner' : (memberRow?.role ?? 'member');

  let displayName = memberRow?.display_name ?? null;
  if (!displayName) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const metaName =
      (data?.user?.user_metadata as { full_name?: string } | null)?.full_name ?? null;
    displayName = metaName ?? data?.user?.email ?? null;
  }

  return {
    role,
    displayName: displayName ?? 'Circle member',
  };
}

async function expirePendingRequests(profileId: string) {
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from('pin_reset_requests')
    .update({ status: 'expired', updated_at: nowIso })
    .eq('profile_id', profileId)
    .eq('status', 'pending')
    .lt('expires_at', nowIso);
}

async function insertCircleAlert(args: {
  profileId: string;
  caretakerId: string | null;
  alertType: string;
  payload: Record<string, unknown>;
}) {
  await supabaseAdmin
    .from('alerts')
    .insert({
      profile_id: args.profileId,
      caretaker_id: args.caretakerId,
      alert_type: args.alertType,
      status: 'resolved',
      payload: args.payload,
    });
}

async function resolveApproverUserIds(profileId: string, caretakerId: string | null) {
  const { data: adminRows } = await supabaseAdmin
    .from('profile_members')
    .select('user_id')
    .eq('profile_id', profileId)
    .eq('role', 'admin');

  const adminIds = (adminRows ?? [])
    .map((row) => row.user_id)
    .filter((id): id is string => Boolean(id));

  const combined = new Set<string>();
  if (caretakerId) {
    combined.add(caretakerId);
  }
  adminIds.forEach((id) => combined.add(id));
  return Array.from(combined);
}

async function resolveEmailPref(profileId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('profile_members')
    .select('notification_preferences')
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .maybeSingle();

  const pref = data?.notification_preferences ?? null;
  const enabled = readBooleanPref(pref, 'enable_email_pin_reset_requests');
  return enabled === true;
}

async function notifyByEmail(args: {
  profileName: string;
  subject: string;
  body: string;
  userIds: string[];
  profileId: string;
}) {
  const recipients: string[] = [];
  for (const userId of args.userIds) {
    const allow = await resolveEmailPref(args.profileId, userId);
    if (!allow) {
      continue;
    }
    const email = await resolveUserEmail(userId);
    if (email) {
      recipients.push(email);
    }
  }

  if (recipients.length === 0) {
    return;
  }

  const text = `${args.body}\n\nProfile: ${args.profileName}`;
  await sendEmail({
    to: recipients,
    subject: args.subject,
    text,
  });
}

async function listRequests(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params as { profileId: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const canAccess = await userCanAccessProfile(userId, profileId);
  if (!canAccess) {
    logProfileAccessDenied('listPinResetRequests', userId, profileId);
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  await expirePendingRequests(profileId);

  const isCaretaker = await userIsCaretaker(userId, profileId);
  const isAdmin = await userHasRole(userId, profileId, 'admin');

  const query = supabaseAdmin
    .from('pin_reset_requests')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (isCaretaker || isAdmin) {
    query.in('status', ['pending', 'approved']).limit(10);
  } else {
    query.eq('requester_user_id', userId).limit(5);
  }

  const { data, error } = await query;
  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to load requests' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ requests: data ?? [] });
}

async function createRequest(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }
  const { profileId } = req.params as { profileId: string };
  if (!profileId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
  }

  const canAccess = await userCanAccessProfile(userId, profileId);
  if (!canAccess) {
    logProfileAccessDenied('createPinResetRequest', userId, profileId);
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id, first_name, last_name')
    .eq('id', profileId)
    .maybeSingle();

  if (!profileRow) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Profile not found' });
  }

  await expirePendingRequests(profileId);

  const nowIso = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from('pin_reset_requests')
    .select('*')
    .eq('profile_id', profileId)
    .eq('requester_user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (existing) {
    return res.status(HTTP_STATUS_CODES.Ok).json({ request: existing });
  }

  const requesterInfo = await resolveRequesterInfo(userId, profileId);
  const expiresAt = addDays(new Date(), REQUEST_EXPIRY_DAYS).toISOString();
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : null;

  const { data: requestRow, error } = await supabaseAdmin
    .from('pin_reset_requests')
    .insert({
      profile_id: profileId,
      requester_user_id: userId,
      requester_name: requesterInfo.displayName,
      requester_role: requesterInfo.role,
      message,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('*')
    .maybeSingle();

  if (error || !requestRow) {
    logger.err(error ?? new Error('Failed to create request'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to create request' });
  }

  const profileName = buildProfileLabel(profileRow);
  const alertMessage = `${requesterInfo.displayName} requested a Safety PIN reset.`;

  await insertCircleAlert({
    profileId,
    caretakerId: profileRow.caretaker_id ?? null,
    alertType: 'pin_reset_request',
    payload: {
      actor_user_id: userId,
      actor_label: requesterInfo.displayName,
      actor_role: requesterInfo.role,
      requester_name: requesterInfo.displayName,
      requester_role: requesterInfo.role,
      message: alertMessage,
    },
  });

  const approverIds = (await resolveApproverUserIds(profileId, profileRow.caretaker_id ?? null))
    .filter((id) => id !== userId);
  await notifyUsersForPinReset(profileId, approverIds, {
    title: 'PIN reset requested',
    body: alertMessage,
    data: {
      profileId,
      type: 'pin_reset_request',
      requestId: requestRow.id,
    },
  });

  try {
    await notifyByEmail({
      profileName,
      subject: 'PIN reset requested',
      body: `${requesterInfo.displayName} requested a Safety PIN reset.`,
      userIds: approverIds,
      profileId,
    });
  } catch (emailError) {
    logger.warn(`Failed to send PIN reset email: ${String(emailError)}`);
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ request: requestRow });
}

async function approveRequest(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }
  const { profileId, requestId } = req.params as { profileId: string; requestId: string };
  if (!profileId || !requestId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing request details' });
  }

  const isCaretaker = await userIsCaretaker(userId, profileId);
  const isAdmin = await userHasRole(userId, profileId, 'admin');
  if (!isCaretaker && !isAdmin) {
    logProfileAccessDenied('approvePinResetRequest', userId, profileId);
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  await expirePendingRequests(profileId);

  const { data: requestRow, error } = await supabaseAdmin
    .from('pin_reset_requests')
    .select('*')
    .eq('id', requestId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error || !requestRow) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Request not found' });
  }

  if (requestRow.status !== 'pending') {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Request is no longer pending' });
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('pin_reset_requests')
    .update({
      status: 'approved',
      approver_user_id: userId,
      approved_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', requestId)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) {
    logger.err(updateError ?? new Error('Failed to approve request'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to approve request' });
  }

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id, first_name, last_name')
    .eq('id', profileId)
    .maybeSingle();

  const approverInfo = await resolveRequesterInfo(userId, profileId);
  const requesterName = requestRow.requester_name ?? 'Circle member';
  const message = `${approverInfo.displayName} approved the PIN reset.`;

  await insertCircleAlert({
    profileId,
    caretakerId: profileRow?.caretaker_id ?? null,
    alertType: 'pin_reset_approved',
    payload: {
      actor_user_id: userId,
      actor_label: approverInfo.displayName,
      actor_role: approverInfo.role,
      requester_name: requesterName,
      message,
    },
  });

  if (requestRow.requester_user_id) {
    await notifyUsersForPinReset(profileId, [requestRow.requester_user_id], {
      title: 'PIN reset approved',
      body: `Your PIN reset request was approved.`,
      data: {
        profileId,
        type: 'pin_reset_approved',
        requestId,
      },
    });

    const profileName = profileRow ? buildProfileLabel(profileRow) : 'your profile';
    try {
      await notifyByEmail({
        profileName,
        subject: 'PIN reset approved',
        body: `${approverInfo.displayName} approved your Safety PIN reset request for ${profileName}.`,
        userIds: [requestRow.requester_user_id],
        profileId,
      });
    } catch (emailError) {
      logger.warn(`Failed to send PIN reset approval email: ${String(emailError)}`);
    }
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ request: updated });
}

async function denyRequest(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }
  const { profileId, requestId } = req.params as { profileId: string; requestId: string };
  if (!profileId || !requestId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing request details' });
  }

  const isCaretaker = await userIsCaretaker(userId, profileId);
  const isAdmin = await userHasRole(userId, profileId, 'admin');
  if (!isCaretaker && !isAdmin) {
    logProfileAccessDenied('denyPinResetRequest', userId, profileId);
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  await expirePendingRequests(profileId);

  const { data: requestRow, error } = await supabaseAdmin
    .from('pin_reset_requests')
    .select('*')
    .eq('id', requestId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error || !requestRow) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Request not found' });
  }

  if (requestRow.status !== 'pending') {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Request is no longer pending' });
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('pin_reset_requests')
    .update({
      status: 'denied',
      approver_user_id: userId,
      denied_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', requestId)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) {
    logger.err(updateError ?? new Error('Failed to deny request'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to deny request' });
  }

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id, first_name, last_name')
    .eq('id', profileId)
    .maybeSingle();

  const approverInfo = await resolveRequesterInfo(userId, profileId);
  const requesterName = requestRow.requester_name ?? 'Circle member';
  const message = `${approverInfo.displayName} denied the PIN reset.`;

  await insertCircleAlert({
    profileId,
    caretakerId: profileRow?.caretaker_id ?? null,
    alertType: 'pin_reset_denied',
    payload: {
      actor_user_id: userId,
      actor_label: approverInfo.displayName,
      actor_role: approverInfo.role,
      requester_name: requesterName,
      message,
    },
  });

  if (requestRow.requester_user_id) {
    await notifyUsersForPinReset(profileId, [requestRow.requester_user_id], {
      title: 'PIN reset denied',
      body: 'Your PIN reset request was denied.',
      data: {
        profileId,
        type: 'pin_reset_denied',
        requestId,
      },
    });

    const profileName = profileRow ? buildProfileLabel(profileRow) : 'your profile';
    try {
      await notifyByEmail({
        profileName,
        subject: 'PIN reset denied',
        body: `${approverInfo.displayName} denied your Safety PIN reset request for ${profileName}.`,
        userIds: [requestRow.requester_user_id],
        profileId,
      });
    } catch (emailError) {
      logger.warn(`Failed to send PIN reset denial email: ${String(emailError)}`);
    }
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ request: updated });
}

async function completeRequest(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }
  const { profileId, requestId } = req.params as { profileId: string; requestId: string };
  if (!profileId || !requestId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing request details' });
  }

  const isCaretaker = await userIsCaretaker(userId, profileId);
  const isAdmin = await userHasRole(userId, profileId, 'admin');
  if (!isCaretaker && !isAdmin) {
    logProfileAccessDenied('completePinResetRequest', userId, profileId);
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { data: requestRow, error } = await supabaseAdmin
    .from('pin_reset_requests')
    .select('*')
    .eq('id', requestId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error || !requestRow) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Request not found' });
  }

  if (requestRow.status !== 'approved') {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Request is not approved' });
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('pin_reset_requests')
    .update({
      status: 'completed',
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', requestId)
    .select('*')
    .maybeSingle();

  if (updateError || !updated) {
    logger.err(updateError ?? new Error('Failed to complete request'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to complete request' });
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ request: updated });
}

export default {
  listRequests,
  createRequest,
  approveRequest,
  denyRequest,
  completeRequest,
};
