import { Request, Response } from 'express';
import fetch from 'node-fetch';
import logger from 'jet-logger';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import supabaseAdmin from '@src/services/supabase';

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

async function userHasRole(
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

  const userIds = new Set<string>();
  userIds.add(profile.caretaker_id);
  (members ?? []).forEach((member) => userIds.add(member.user_id));

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
      ...entry,
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
    ...(members ?? []).map((member) => {
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
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { data: member } = await supabaseAdmin
    .from('profile_members')
    .select('id, user_id, role')
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
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  const { data: member } = await supabaseAdmin
    .from('profile_members')
    .select('id, profile_id, user_id, role')
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

  let invite = await fetchInvite('id', inviteId);
  if (!invite) {
    invite = await fetchInvite('short_code', inviteId);
  }
  if (!invite) {
    invite = await fetchInvite('email', inviteId);
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
  const displayName = buildDisplayName({
    fallbackName: requestedName || null,
    email: userRow?.user?.email ?? null,
    metadata: userRow?.user?.user_metadata ?? null,
  });
  const { data: member, error: memberError } = await supabaseAdmin
    .from('profile_members')
    .upsert(
      {
        profile_id: invite.profile_id,
        user_id: userId,
        role: invite.role,
        display_name: displayName,
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

  return res.status(HTTP_STATUS_CODES.Ok).json({ member });
}

export default {
  listMembers,
  removeMember,
  changeMemberRole,
  acceptInvite,
};
