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
}
