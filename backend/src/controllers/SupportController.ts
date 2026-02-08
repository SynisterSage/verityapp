import { Request, Response } from 'express';

import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { getAuthenticatedUserId, userCanAccessProfile } from '@src/common/util/auth';

type SupportMessageRow = {
  id: string;
  profile_id: string;
  sender: 'user' | 'agent';
  content: string;
  category: string | null;
  metadata: Record<string, unknown> | null;
  is_read_by_user: boolean;
  is_read_by_agent: boolean;
  created_at: string;
  updated_at: string;
};

type AccessibleProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  twilio_virtual_number: string | null;
  created_at: string;
};

type SupportTicketSummary = {
  profile_id: string;
  profile_name: string;
  twilio_virtual_number: string | null;
  last_message: SupportMessageRow | null;
  unread_agent_messages: number;
  last_activity_at: string | null;
};

async function fetchAccessibleProfiles(userId: string) {
  const { data: caretakerRows } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, twilio_virtual_number, created_at')
    .eq('caretaker_id', userId);
  const { data: memberRows } = await supabaseAdmin
    .from('profile_members')
    .select('profile_id')
    .eq('user_id', userId);
  const memberIds = Array.from(new Set(memberRows?.map((row) => row.profile_id ?? '').filter(Boolean)));
  let memberProfiles: AccessibleProfileRow[] = [];
  if (memberIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, twilio_virtual_number, created_at')
      .in('id', memberIds);
    memberProfiles = (data ?? []) as AccessibleProfileRow[];
  }
  const map = new Map<string, AccessibleProfileRow>();
  const caretakerList = (caretakerRows ?? []) as AccessibleProfileRow[];
  caretakerList.forEach((row) => {
    if (row?.id) {
      map.set(row.id, row);
    }
  });
  memberProfiles.forEach((row) => {
    if (row?.id) {
      map.set(row.id, row);
    }
  });
  return Array.from(map.values());
}

async function fetchLatestMessageForProfile(profileId: string) {
  const { data, error } = await supabaseAdmin
    .from('support_messages')
    .select('id, profile_id, sender, content, category, metadata, is_read_by_user, is_read_by_agent, created_at, updated_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('Failed to fetch latest support message', error);
    return null;
  }
  return (data as SupportMessageRow) ?? null;
}

async function fetchUnreadAgentMessagesCount(profileId: string) {
  const { count, error } = await supabaseAdmin
    .from('support_messages')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('sender', 'agent')
    .eq('is_read_by_user', false);
  if (error) {
    console.warn('Failed to fetch unread agent count', error);
    return 0;
  }
  return count ?? 0;
}

export default class SupportController {
  static async listMessages(req: Request, res: Response) {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId } = req.params;
    if (!profileId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
    }

    const allowed = await userCanAccessProfile(userId, profileId);
    if (!allowed) {
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const limitParam = Number(req.query?.limit ?? 200);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 2000) : 200;

    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .select(
        'id, sender, content, category, metadata, is_read_by_user, is_read_by_agent, created_at, updated_at'
      )
      .eq('profile_id', profileId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.warn('Failed to fetch support messages', error);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to load messages' });
    }

    return res.status(HTTP_STATUS_CODES.Ok).json({ messages: data ?? [] });
  }

  static async createMessage(req: Request, res: Response) {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId } = req.params;
    if (!profileId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
    }

    const allowed = await userCanAccessProfile(userId, profileId);
    if (!allowed) {
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const { content, category, metadata } = (req as any).validatedBody as {
      content: string;
      category?: string;
      metadata?: Record<string, unknown>;
    };

    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .insert([
        {
          profile_id: profileId,
          sender: 'user',
          content,
          category: category ?? null,
          metadata: metadata ?? null,
          is_read_by_user: true,
          is_read_by_agent: false,
        },
      ])
      .select('*')
      .single();

    if (error) {
      console.warn('Failed to insert support message', error);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to send message' });
    }

    return res.status(201).json({ message: data });
  }

  static async markAgentMessagesRead(req: Request, res: Response) {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId } = req.params;
    if (!profileId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
    }

    const allowed = await userCanAccessProfile(userId, profileId);
    if (!allowed) {
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const { error } = await supabaseAdmin
      .from('support_messages')
      .update({ is_read_by_user: true })
      .eq('profile_id', profileId)
      .eq('sender', 'agent')
      .eq('is_read_by_user', false);

    if (error) {
      console.warn('Failed to mark agent messages as read', error);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to update messages' });
    }

    return res.status(HTTP_STATUS_CODES.Ok).json({ ok: true });
  }

  static async getUnreadCount(req: Request, res: Response) {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId } = req.params;
    if (!profileId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
    }

    const allowed = await userCanAccessProfile(userId, profileId);
    if (!allowed) {
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const { error, count } = await supabaseAdmin
      .from('support_messages')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('sender', 'agent')
      .eq('is_read_by_user', false);

    if (error) {
      console.warn('Failed to count unread agent messages', error);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to load summary' });
    }

    return res.status(HTTP_STATUS_CODES.Ok).json({ unreadAgentMessages: count ?? 0 });
  }

  static async listTickets(req: Request, res: Response) {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const profiles = await fetchAccessibleProfiles(userId);
    if (profiles.length === 0) {
      return res.status(HTTP_STATUS_CODES.Ok).json({ tickets: [] });
    }

    const ticketSummaries: SupportTicketSummary[] = await Promise.all(
      profiles.map(async (profile) => {
        const lastMessage = await fetchLatestMessageForProfile(profile.id);
        const unreadAgentMessages = await fetchUnreadAgentMessagesCount(profile.id);
        return {
          profile_id: profile.id,
          profile_name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Support ticket',
          twilio_virtual_number: profile.twilio_virtual_number,
          last_message: lastMessage,
          unread_agent_messages: unreadAgentMessages,
          last_activity_at: lastMessage?.created_at ?? profile.created_at,
        };
      })
    );

    ticketSummaries.sort((a, b) => {
      const aTime = new Date(a.last_activity_at ?? '').getTime();
      const bTime = new Date(b.last_activity_at ?? '').getTime();
      return bTime - aTime;
    });

    return res.status(HTTP_STATUS_CODES.Ok).json({ tickets: ticketSummaries });
  }
}
