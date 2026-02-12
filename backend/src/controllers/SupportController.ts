import { Request, Response } from 'express';

import { randomUUID } from 'crypto';
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
  ticket_id: string;
  ticket_subject: string | null;
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

const PROMPT_AUTO_REPLY: Record<string, string> = {
  'Billing question':
    'Billing for Verity Protect runs through the App Store or Play Store—you can see receipts and cancel subscriptions there. An agent will send any extra details or next steps shortly.',
  'Automation & alerts':
    'Automation hunts for scam keywords, repeat callers, and location patterns. Safe phrases let you tell us a call is good without interruption. An agent will be here shortly to help adjust the thresholds and notifications.',
  'Members & roles':
    'Caretakers can update automation, invite others, and respond to alerts. Trusted contacts only read alerts and can verify safe phrases once you allow the contact picker in Settings → Data & Privacy, and guests have view-only access. An agent will be with you shortly to walk through any role changes.',
  'Call recordings':
    'Call entries store recordings, transcripts, and fraud scores so you can review what happened before sharing with your circle. I’m flagging your request and an agent will follow up soon with the right file or link.',
  'Safe phrases':
    'Safe phrases are words your circle uses to confirm a caller is trusted, and they keep automation from interrupting. Add them in Settings → Safe Phrases. An agent will arrive shortly to help you pick and save the right ones.',
  'Connect Verity number':
    'Forwarding the Verity number means pairing it to your phone or device in Settings → Paired Devices so calls ring on the hardware you chose. I’ve captured the request and an agent will explain how to finish the setup.',
  'General question':
    'Thanks for the question. An agent will review your note shortly and give you a full answer.',
};

const RESOURCE_AUTO_REPLY_TYPE = 'resource-suggestion';
const RESOURCE_AUTO_REPLY_CONTENT =
  'Thanks for the note. An agent will be with you shortly, and the Resources tab in the Support portal highlights system basics, automation & alerts, members & roles, billing, and the FAQ while you wait.';

function resolveTicketIdentifier(message: SupportMessageRow) {
  const metadataTicketId = (message.metadata as Record<string, unknown> | null)?.ticketId;
  if (typeof metadataTicketId === 'string' && metadataTicketId.trim().length > 0) {
    return metadataTicketId;
  }
  return message.profile_id;
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

async function hasResourceAutoReply(profileId: string, ticketId: string) {
  const { data } = await supabaseAdmin
    .from('support_messages')
    .select('id')
    .eq('profile_id', profileId)
    .eq('metadata->>ticketId', ticketId)
    .eq('sender', 'agent')
    .eq('metadata->>autoReplyType', RESOURCE_AUTO_REPLY_TYPE)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

async function insertResourceAutoReply(profileId: string, ticketId: string, ticketSubject: string) {
  const metadata: Record<string, unknown> = {
    ticketId,
    ticketSubject,
    ticketState: 'open',
    autoReplyType: RESOURCE_AUTO_REPLY_TYPE,
  };
  const { error } = await supabaseAdmin.from('support_messages').insert([
    {
      profile_id: profileId,
      sender: 'agent',
      content: RESOURCE_AUTO_REPLY_CONTENT,
      category: 'auto',
      metadata,
      is_read_by_user: false,
      is_read_by_agent: true,
    },
  ]);
  if (error) {
    console.warn('Failed to insert resource auto reply', error);
  }
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

    const ticketIdParam = typeof req.query?.ticketId === 'string' && req.query.ticketId.trim() ? req.query.ticketId : null;
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

    const rows = (data ?? []) as SupportMessageRow[];
    const filtered = ticketIdParam
      ? rows.filter((row) => resolveTicketIdentifier(row) === ticketIdParam)
      : rows;
    return res.status(HTTP_STATUS_CODES.Ok).json({ messages: filtered });
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

    const metadataTicketId = metadata?.ticketId;
    const ticketId =
      typeof metadataTicketId === 'string' && metadataTicketId.trim().length > 0
        ? metadataTicketId
        : randomUUID();

    const subjectCandidate = typeof metadata?.ticketSubject === 'string' && metadata.ticketSubject.trim().length > 0
      ? metadata.ticketSubject.trim()
      : content.trim().slice(0, 80);

    const { count: existingCount } = await supabaseAdmin
      .from('support_messages')
      .select('id', { count: 'exact', head: true })
      .eq('metadata->>ticketId', ticketId);
    const isNewTicket = (existingCount ?? 0) === 0;

    const resolvedMetadata: Record<string, unknown> = {
      ...(metadata ?? {}),
      ticketId,
      ticketSubject: isNewTicket ? subjectCandidate : metadata?.ticketSubject ?? subjectCandidate,
    };

    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .insert([
        {
          profile_id: profileId,
          sender: 'user',
          content,
          category: category ?? null,
          metadata: resolvedMetadata,
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

    const resolvedTicketState = typeof resolvedMetadata.ticketState === 'string' ? resolvedMetadata.ticketState : null;
    const shouldAutoReply = resolvedTicketState !== 'closed';

    if (isNewTicket && shouldAutoReply) {
      const greetingMetadata: Record<string, unknown> = {
        ticketId,
        ticketSubject: subjectCandidate,
        ticketState: 'open',
      };
      const { error: agentError } = await supabaseAdmin
        .from('support_messages')
        .insert([
          {
            profile_id: profileId,
            sender: 'agent',
            content: 'Hi there! What can we assist you with today?',
            category: 'auto',
            metadata: greetingMetadata,
            is_read_by_user: false,
            is_read_by_agent: true,
          },
        ]);
      if (agentError) {
        console.warn('Failed to insert agent greeting', agentError);
      }
    }

    const promptLabel = metadata?.promptLabel;
    if (typeof promptLabel === 'string' && shouldAutoReply) {
      const autoMessage = PROMPT_AUTO_REPLY[promptLabel];
      if (autoMessage) {
        const autoMetadata: Record<string, unknown> = {
          ticketId,
          ticketState: 'open',
          ticketSubject: subjectCandidate,
          promptLabel,
        };
        const { error: autoError } = await supabaseAdmin
          .from('support_messages')
          .insert([
            {
              profile_id: profileId,
              sender: 'agent',
              content: autoMessage,
              category: 'auto',
              metadata: autoMetadata,
              is_read_by_user: false,
              is_read_by_agent: true,
            },
          ]);
        if (autoError) {
          console.warn('Failed to insert prompt reply', autoError);
        }
      }
    }

    if (typeof promptLabel !== 'string' && shouldAutoReply) {
      const alreadyAutoReplied = await hasResourceAutoReply(profileId, ticketId);
      if (!alreadyAutoReplied) {
        await insertResourceAutoReply(profileId, ticketId, subjectCandidate);
      }
    }

    return res.status(201).json({ message: data });
  }

  static async createTicket(req: Request, res: Response) {
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

    const ticketId = randomUUID();
    const metadata: Record<string, unknown> = {
      ticketId,
      ticketSubject: 'New support conversation',
      ticketState: 'open',
    };

    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .insert([
        {
          profile_id: profileId,
          sender: 'agent',
          content: 'Hi there! What can we assist you with today?',
          category: 'auto',
          metadata,
          is_read_by_user: false,
          is_read_by_agent: true,
        },
      ])
      .select('*')
      .single();

    if (error) {
      console.warn('Failed to create support ticket', error);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to create ticket' });
    }

    return res.status(201).json({ ticketId, message: data });
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

    const profileIds = profiles.map((profile) => profile.id);
    const profileMap = new Map<string, AccessibleProfileRow>();
    profiles.forEach((profile) => {
      profileMap.set(profile.id, profile);
    });

    const { data, error } = await supabaseAdmin
      .from('support_messages')
      .select(
        'id, profile_id, sender, content, category, metadata, is_read_by_user, is_read_by_agent, created_at, updated_at'
      )
      .in('profile_id', profileIds)
      .order('created_at', { ascending: false })
      .limit(400);

    if (error) {
      console.warn('Failed to fetch tickets', error);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to load tickets' });
    }

    const ticketsMap = new Map<string, SupportTicketSummary>();
    const rows = (data ?? []) as SupportMessageRow[];
    rows.forEach((message) => {
      const ticketId = resolveTicketIdentifier(message);
      if (!ticketId) {
        return;
      }
      const existing = ticketsMap.get(ticketId);
      const profile = profileMap.get(message.profile_id);
      if (!profile) {
        return;
      }
      const messageMetadata = message.metadata as Record<string, unknown> | null;
      const ticketSubject = typeof messageMetadata?.ticketSubject === 'string' ? messageMetadata.ticketSubject : null;
      if (!existing) {
        ticketsMap.set(ticketId, {
          ticket_id: ticketId,
          profile_id: profile.id,
          profile_name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Support ticket',
          twilio_virtual_number: profile.twilio_virtual_number,
          last_message: message,
          last_activity_at: message.created_at,
          unread_agent_messages: message.sender === 'agent' && !message.is_read_by_user ? 1 : 0,
          ticket_subject: ticketSubject,
        });
        return;
      }
      const existingLastActivity = new Date(existing.last_activity_at ?? '').getTime();
      const messageTime = new Date(message.created_at).getTime();
      if (messageTime > existingLastActivity) {
        existing.last_message = message;
        existing.last_activity_at = message.created_at;
        existing.ticket_subject = existing.ticket_subject ?? ticketSubject;
      }
      if (message.sender === 'agent' && !message.is_read_by_user) {
        existing.unread_agent_messages += 1;
      }
      ticketsMap.set(ticketId, existing);
    });

    const ticketSummaries = Array.from(ticketsMap.values()).sort((a, b) => {
      const aTime = new Date(a.last_activity_at ?? '').getTime();
      const bTime = new Date(b.last_activity_at ?? '').getTime();
      return bTime - aTime;
    });

    return res.status(HTTP_STATUS_CODES.Ok).json({ tickets: ticketSummaries });
  }

  static async deleteTicket(req: Request, res: Response) {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId, ticketId } = req.params;
    if (!profileId || !ticketId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId or ticketId' });
    }

    const allowed = await userCanAccessProfile(userId, profileId);
    if (!allowed) {
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const { data, error: fetchError } = await supabaseAdmin
      .from('support_messages')
      .select('metadata')
      .eq('profile_id', profileId)
      .eq('metadata->>ticketId', ticketId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError || !data) {
      console.warn('Failed to load ticket metadata', fetchError);
      return res.status(HTTP_STATUS_CODES.NotFound).json({ error: 'Ticket not found' });
    }

    const metadata = data.metadata as Record<string, unknown> | null;
    if (metadata?.ticketState !== 'closed') {
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Only handled tickets can be deleted' });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('support_messages')
      .delete()
      .eq('profile_id', profileId)
      .eq('metadata->>ticketId', ticketId);

    if (deleteError) {
      console.warn('Failed to delete ticket', deleteError);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to delete ticket' });
    }

    return res.status(HTTP_STATUS_CODES.Ok).json({ deleted: true });
  }
}
