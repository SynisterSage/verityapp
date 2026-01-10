import { Request, Response } from 'express';
import logger from 'jet-logger';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import supabaseAdmin from '@src/services/supabase';

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
  role: 'admin' | 'editor' | 'viewer'
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
    .select('id, profile_id, user_id, role, created_at')
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

  const formattedMembers = [
    {
      id: `caretaker-${profile.caretaker_id}`,
      profile_id: profileId,
      user_id: profile.caretaker_id,
      role: 'admin',
      created_at: null,
      is_caretaker: true,
      user: userMap.get(profile.caretaker_id) ?? null,
    },
    ...(members ?? []).map((member) => ({
      ...member,
      is_caretaker: false,
      user: userMap.get(member.user_id) ?? null,
    })),
  ];

  return res.status(HTTP_STATUS_CODES.Ok).json({ members: formattedMembers });
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

  const isAdmin = await userHasRole(userId, profileId, 'admin');
  if (!isAdmin) {
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

  const { error } = await supabaseAdmin
    .from('profile_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    logger.err(error);
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to remove member' });
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

  let { data: invite } = await supabaseAdmin
    .from('profile_invites')
    .select('id, profile_id, email, role, status')
    .eq('id', inviteId)
    .maybeSingle();
  if (!invite) {
    const { data: emailRow } = await supabaseAdmin
      .from('profile_invites')
      .select('id, profile_id, email, role, status')
      .eq('email', inviteId)
      .maybeSingle();
    invite = emailRow ?? null;
  }

  if (!invite || invite.status !== 'pending') {
    return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Invite not found or already handled' });
  }

  const { data: member, error: memberError } = await supabaseAdmin
    .from('profile_members')
    .upsert(
      {
        profile_id: invite.profile_id,
        user_id: userId,
        role: invite.role,
      },
      { onConflict: 'profile_id,user_id' }
    )
    .select('id, profile_id, user_id, role, created_at')
    .maybeSingle();

  if (memberError || !member) {
    logger.err(memberError ?? new Error('Failed to accept invite'));
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Failed to accept invite' });
  }

  await supabaseAdmin
    .from('profile_invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', inviteId);

  return res.status(HTTP_STATUS_CODES.Ok).json({ member });
}

export default {
  listMembers,
  removeMember,
  acceptInvite,
};
