import { Request, Response } from 'express';
import fetch from 'node-fetch';
import logger from 'jet-logger';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import supabaseAdmin from '@src/services/supabase';
import { formatShortCode, generateUniqueShortCode } from '@src/common/helpers/invite';
import { createInviteClaimToken, parseInviteClaimToken } from '@src/services/inviteClaims';
import {
  getAuthenticatedUserId,
  logProfileAccessDenied,
  userCanAccessProfile,
  userHasRole,
  userIsCaretaker,
} from '@src/common/util/auth';
import { recordCircleAlert } from '@src/services/circleAlerts';

const SUPABASE_ADMIN_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

async function revokeUserSessions(userId: string) {
  if (!SUPABASE_ADMIN_URL || !SUPABASE_SERVICE_KEY) {
    return;
  }
  try {
    await fetch(`${SUPABASE_ADMIN_URL}/auth/v1/admin/users/${userId}/sessions`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (sessionError) {
    logger.warn('Failed to revoke member sessions', sessionError);
  }
}

const VALID_ROLES = ['admin', 'editor'] as const;

function formatName(value?: string | null) {
  if (!value) {
    return null;
  }
  if (value.includes('@')) {
    return value;
  }
  return value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function buildDisplayName({
  fallbackName,
  email,
  metadata,
}: {
  fallbackName?: string | null;
  email?: string | null;
  metadata?: { full_name?: string; first_name?: string; last_name?: string } | null;
}) {
  const metaFullName = metadata?.full_name;
  const firstLast = [metadata?.first_name, metadata?.last_name]
    .filter(Boolean)
    .map((segment) => segment?.trim())
    .join(' ')
    .trim();
  const metaName = metaFullName ?? (firstLast || undefined);
  const candidate = formatName(fallbackName ?? metaName ?? email) ?? metaName ?? fallbackName ?? email ?? null;
  return candidate;
}

function normalizeShortCode(input: string) {
  const cleaned = input.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (cleaned.length !== 8) {
    return null;
  }
  return formatShortCode(cleaned);
}

async function ensureInviteShortCode(invite: { id: string; short_code?: string | null }) {
  const existing = normalizeShortCode(invite.short_code ?? '');
  if (existing) {
    return existing;
  }

  const generated = (await generateUniqueShortCode()) ?? formatShortCode(invite.id.slice(0, 8));
  const normalized = normalizeShortCode(generated);
  if (!normalized) {
    return null;
  }

  const { error } = await supabaseAdmin
    .from('profile_invites')
    .update({ short_code: normalized })
    .eq('id', invite.id);

  if (error) {
    logger.err(error);
    return null;
  }

  return normalized;
}

async function resolvePendingInviteByIdentifier(args: { inviteId?: string; shortCode?: string | null }) {
  const inviteId = args.inviteId?.trim();
  const normalizedShortCode = normalizeShortCode(args.shortCode ?? '');

  if (inviteId) {
    const { data, error } = await supabaseAdmin
      .from('profile_invites')
      .select('id, profile_id, role, status, short_code')
      .eq('id', inviteId)
      .eq('status', 'pending')
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (data) {
      return data;
    }
  }

  if (normalizedShortCode) {
    const { data, error } = await supabaseAdmin
      .from('profile_invites')
      .select('id, profile_id, role, status, short_code')
      .eq('short_code', normalizedShortCode)
      .eq('status', 'pending')
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (data) {
      return data;
    }
  }

  return null;
}

async function resolveInviteClaimToken(req: Request, res: Response) {
  const query = ((req as any).validatedBody ?? req.query ?? {}) as {
    t?: string;
    token?: string;
    code?: string;
    inviteId?: string;
    invite_id?: string;
  };

  const tokenValue = (query.t ?? query.token ?? '').trim();
  const codeValue = normalizeShortCode(query.code ?? '');
  const inviteIdValue = (query.inviteId ?? query.invite_id ?? '').trim();

  try {
    let resolvedInvite:
      | {
          id: string;
          profile_id: string;
          role: string;
          status: string;
          short_code: string | null;
        }
      | null = null;

    if (tokenValue) {
      const parsedToken = parseInviteClaimToken(tokenValue);
      if (!parsedToken) {
        return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Invite link is invalid or expired' });
      }

      resolvedInvite = await resolvePendingInviteByIdentifier({
        inviteId: parsedToken.inviteId,
        shortCode: parsedToken.inviteCode,
      });
      if (!resolvedInvite) {
        return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Invite link is invalid or expired' });
      }

      if (parsedToken.inviteCode) {
        const resolvedCode = normalizeShortCode(resolvedInvite.short_code ?? '');
        if (!resolvedCode || resolvedCode !== parsedToken.inviteCode) {
          return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Invite link is invalid or expired' });
        }
      }
    } else {
      resolvedInvite = await resolvePendingInviteByIdentifier({
        inviteId: inviteIdValue || undefined,
        shortCode: codeValue,
      });
      if (!resolvedInvite) {
        return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Invite link is invalid or expired' });
      }
    }

    const shortCode = await ensureInviteShortCode(resolvedInvite);
    if (!shortCode) {
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to resolve invite link' });
    }

    const hydratedInvite = {
      ...resolvedInvite,
      short_code: shortCode,
    };
    let refreshedToken: string | undefined;
    try {
      refreshedToken = createInviteClaimToken({
        inviteId: hydratedInvite.id,
        inviteCode: hydratedInvite.short_code,
      });
    } catch (error) {
      logger.warn(
        `[invite-claims] unable to create invite claim token: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      );
    }

    return res.status(HTTP_STATUS_CODES.Ok).json({
      eligible: true,
      token: refreshedToken,
      code: shortCode,
      invite: {
        id: hydratedInvite.id,
        role: hydratedInvite.role,
      },
    });
  } catch (error) {
    logger.err(error as Error);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to resolve invite link' });
  }
}

async function listMembers(req: Request, res: Response) {
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
    logProfileAccessDenied('listMembers', userId, profileId);
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, caretaker_id')
    .eq('id', profileId)
    .single();

  if (!profile) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Profile not found' });
  }

  const { data: members } = await supabaseAdmin
    .from('profile_members')
    .select('id, profile_id, user_id, role, created_at, display_name')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true });

  type MemberRow = NonNullable<typeof members>[number];
  const uniqueMembersMap = new Map<string, MemberRow>();
  (members ?? []).forEach((member) => {
    if (!uniqueMembersMap.has(member.user_id)) {
      uniqueMembersMap.set(member.user_id, member);
    }
  });
  const filteredMembers = Array.from(uniqueMembersMap.values()).filter(
    (member) => member.user_id !== profile.caretaker_id
  );

  const userIds = new Set<string>();
  userIds.add(profile.caretaker_id);
  filteredMembers.forEach((member) => userIds.add(member.user_id));

  const { data: users } = await supabaseAdmin
    .from('auth.users')
    .select('id, email, user_metadata')
    .in('id', Array.from(userIds));

  const userMap = new Map((users ?? []).map((user) => [user.id, user]));

  const { data: userProfiles } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id, first_name, last_name')
    .in('caretaker_id', Array.from(userIds));

  const profileNames = new Map<string, string>();
  (userProfiles ?? []).forEach((person) => {
    if (!person.caretaker_id) {
      return;
    }
    const fullName = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
    if (!fullName) {
      return;
    }
    profileNames.set(person.caretaker_id, formatName(fullName) ?? fullName);
  });

  const resolveName = (userId: string, entry?: any) => {
    if (!entry) {
      return profileNames.get(userId) ?? null;
    }
    const fallback = profileNames.get(userId);
    const metadata = entry.user_metadata;
    const email = entry.email;
    return (
      buildDisplayName({
        fallbackName: fallback,
        email,
        metadata,
      }) ?? null
    );
  };

  const hydrateUser = (userId: string, entry?: any) => {
    if (!entry) {
      return entry;
    }
    const formatted = resolveName(userId, entry);
    return {
      id: entry.id,
      user_metadata: {
        ...(entry.user_metadata ?? {}),
        full_name: formatted ?? entry.user_metadata?.full_name,
      },
    };
  };

  const pendingNameUpdates: Array<{ id: string; name: string }> = [];

  const formattedMembers = [
    {
      id: `caretaker-${profile.caretaker_id}`,
      profile_id: profileId,
      user_id: profile.caretaker_id,
      role: 'admin',
      created_at: null,
      is_caretaker: true,
      display_name: resolveName(profile.caretaker_id, userMap.get(profile.caretaker_id)),
      user: hydrateUser(profile.caretaker_id, userMap.get(profile.caretaker_id) ?? null),
    },
    ...filteredMembers.map((member) => {
      const entry = userMap.get(member.user_id);
      const resolvedName = resolveName(member.user_id, entry);
      if (!member.display_name && resolvedName) {
        pendingNameUpdates.push({ id: member.id, name: resolvedName });
      }
      return {
        ...member,
        is_caretaker: false,
        display_name: member.display_name ?? resolvedName,
        user: hydrateUser(member.user_id, entry ?? null),
      };
    }),
  ];

  if (pendingNameUpdates.length > 0) {
    await Promise.all(
      pendingNameUpdates.map((update) =>
        supabaseAdmin.from('profile_members').update({ display_name: update.name }).eq('id', update.id)
      )
    );
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ members: formattedMembers });
}

async function changeMemberRole(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId, memberId } = req.params as { profileId: string; memberId: string };
  const { role } = req.body as { role?: string };
  if (!profileId || !memberId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profile or member id' });
  }
  if (!role || !VALID_ROLES.includes(role as any)) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid role' });
  }

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', profileId)
    .maybeSingle();
  if (!profileRow?.caretaker_id) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Profile not found' });
  }

  const isCaretakerRequester = profileRow.caretaker_id === userId;
  const isAdminRequester = !isCaretakerRequester && (await userHasRole(userId, profileId, 'admin'));
  if (!isCaretakerRequester && !isAdminRequester) {
    logProfileAccessDenied('changeMemberRole', userId, profileId, { memberId });
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { data: member } = await supabaseAdmin
    .from('profile_members')
    .select('id, user_id, role, display_name')
    .eq('id', memberId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (!member) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Member not found' });
  }
  if (member.user_id === profileRow.caretaker_id) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Cannot change owner role' });
  }
  if (!isCaretakerRequester && member.role === 'admin') {
    return res
      .status(HTTP_STATUS_CODES.Forbidden)
      .json({ error: 'Only caretakers can modify admins' });
  }
  if (!isCaretakerRequester && role === 'admin') {
    return res
      .status(HTTP_STATUS_CODES.Forbidden)
      .json({ error: 'Only caretakers can grant admin role' });
  }
  if (!isCaretakerRequester && member.user_id === userId) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Cannot change your own role' });
  }

  const { error } = await supabaseAdmin
    .from('profile_members')
    .update({ role })
    .eq('id', memberId);
  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to update role' });
  }

  try {
    const actorRole = isCaretakerRequester ? 'caretaker' : 'admin';
    const actorLabel = isCaretakerRequester ? 'Circle owner' : 'Circle member';
    const targetLabel = member.display_name ?? 'Circle member';
    const roleLabel = role === 'admin' ? 'Caretaker' : 'Family member';
    await recordCircleAlert({
      profileId,
      alertType: 'member_role_changed',
      payload: {
        actor_user_id: userId,
        actor_role: actorRole,
        actor_label: actorLabel,
        target_user_id: member.user_id,
        target_display_name: targetLabel,
        target_role: role,
        message: `Set ${targetLabel} as ${roleLabel}.`,
      },
    });
  } catch (alertError) {
    logger.err(alertError);
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ memberId, role });
}

async function removeMember(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId, memberId } = req.params as { profileId: string; memberId: string };
  if (!profileId || !memberId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId or memberId' });
  }

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', profileId)
    .maybeSingle();
  if (!profileRow?.caretaker_id) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Profile not found' });
  }
  const isCaretakerRequester = profileRow.caretaker_id === userId;
  const isAdminRequester = !isCaretakerRequester && (await userHasRole(userId, profileId, 'admin'));
  if (!isCaretakerRequester && !isAdminRequester) {
    logProfileAccessDenied('removeMember', userId, profileId, { memberId });
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { data: member } = await supabaseAdmin
    .from('profile_members')
    .select('id, profile_id, user_id, role, display_name')
    .eq('id', memberId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (!member) {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Member not found' });
  }
  if (member.user_id === profileRow.caretaker_id) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Cannot remove owner' });
  }
  if (!isCaretakerRequester && member.role === 'admin') {
    return res
      .status(HTTP_STATUS_CODES.Forbidden)
      .json({ error: 'Only caretakers can remove admins' });
  }
  if (member.user_id === userId) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Cannot remove yourself' });
  }

  const { error } = await supabaseAdmin
    .from('profile_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to remove member' });
  }

  await revokeUserSessions(member.user_id);

  const { data: userRow, error: userError } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
  await supabaseAdmin
    .from('profile_invites')
    .delete()
    .eq('profile_id', member.profile_id)
    .eq('accepted_by', member.user_id)
    .eq('status', 'accepted');
  if (!userError && userRow?.user?.email) {
    await supabaseAdmin
      .from('profile_invites')
      .delete()
      .eq('profile_id', member.profile_id)
      .eq('email', userRow.user.email)
      .eq('status', 'accepted');
  }

  try {
    const actorRole = isCaretakerRequester ? 'caretaker' : 'admin';
    const actorLabel = isCaretakerRequester ? 'Circle owner' : 'Circle member';
    const targetLabel = member.display_name ?? 'Circle member';
    await recordCircleAlert({
      profileId,
      alertType: 'member_removed',
      payload: {
        actor_user_id: userId,
        actor_role: actorRole,
        actor_label: actorLabel,
        target_user_id: member.user_id,
        target_display_name: targetLabel,
        message: `Removed ${targetLabel} from the circle.`,
      },
    });
  } catch (alertError) {
    logger.err(alertError);
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ removed: member });
}

async function acceptInvite(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { inviteId } = req.params as { inviteId: string };
  if (!inviteId) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing inviteId' });
  }

  const inviteFields = 'id, profile_id, email, role, status, short_code';
  const fetchInvite = async (column: 'id' | 'short_code' | 'email', value: string) => {
    const { data } = await supabaseAdmin
      .from('profile_invites')
      .select(inviteFields)
      .eq(column, value)
      .maybeSingle();
    return data ?? null;
  };
  const isEmailLike = (value: string) => value.includes('@');
  const isSmsInviteEmail = (value?: string | null) =>
    Boolean(value && value.toLowerCase().endsWith('@verityprotect.sms'));

  let invite = await fetchInvite('id', inviteId);
  if (!invite) {
    const normalizedShortCode = normalizeShortCode(inviteId);
    if (normalizedShortCode) {
      invite = await fetchInvite('short_code', normalizedShortCode);
    } else {
      invite = await fetchInvite('short_code', inviteId);
    }
  }
  if (!invite) {
    if (isEmailLike(inviteId)) {
      invite = await fetchInvite('email', inviteId.toLowerCase());
    }
  }

  if (!invite || invite.status !== 'pending') {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Invite not found or already handled' });
  }

  const { firstName, lastName } = (req.body ?? {}) as { firstName?: string; lastName?: string };
  const requestedName = [firstName, lastName]
    .filter(Boolean)
    .map((segment) => segment?.trim())
    .join(' ')
    .trim();
  const { data: userRow } = await supabaseAdmin.auth.admin.getUserById(userId);
  const userEmail = userRow?.user?.email?.trim().toLowerCase() ?? null;
  const inviteEmail = invite.email?.trim().toLowerCase() ?? null;
  if (inviteEmail && !isSmsInviteEmail(inviteEmail)) {
    if (!userEmail || inviteEmail !== userEmail) {
      return res
        .status(HTTP_STATUS_CODES.Forbidden)
        .json({ error: 'Invite does not match the authenticated account' });
    }
  }
  const displayName = buildDisplayName({
    fallbackName: requestedName || null,
    email: userRow?.user?.email ?? null,
    metadata: userRow?.user?.user_metadata ?? null,
  });
  const actorLabel = displayName ?? 'Circle member';

  // Get caretaker_id for RLS policy
  const { data: profileData } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id')
    .eq('id', invite.profile_id)
    .single();

  const { data: member, error: memberError } = await supabaseAdmin
    .from('profile_members')
    .upsert(
      {
        profile_id: invite.profile_id,
        user_id: userId,
        role: invite.role,
        display_name: displayName,
        caretaker_id: profileData?.caretaker_id,
      },
      { onConflict: 'profile_id,user_id' }
    )
    .select('id, profile_id, user_id, role, created_at, display_name')
    .maybeSingle();

  if (memberError || !member) {
    logger.err(memberError ?? new Error('Failed to accept invite'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to accept invite' });
  }

  if (displayName) {
    await supabaseAdmin.auth.admin
      .updateUserById(userId, {
        user_metadata: {
          ...(userRow?.user?.user_metadata ?? {}),
          full_name: displayName,
        },
      })
      .catch((err) => {
        logger.warn('Unable to update user metadata with display name', err);
      });
  }

  await supabaseAdmin
    .from('profile_invites')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq('id', invite.id);

  try {
    const targetLabel = actorLabel;
    await recordCircleAlert({
      profileId: invite.profile_id,
      alertType: 'member_joined',
      payload: {
        actor_user_id: userId,
        actor_role: 'member',
        actor_label: actorLabel,
        member_user_id: userId,
        member_display_name: targetLabel,
        message: `${targetLabel} joined the circle.`,
      },
    });
  } catch (alertError) {
    logger.err(alertError);
  }

  return res.status(HTTP_STATUS_CODES.Ok).json({ member });
}

export default {
  listMembers,
  removeMember,
  changeMemberRole,
  acceptInvite,
  resolveInviteClaimToken,
};
