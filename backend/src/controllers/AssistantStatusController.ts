import { Request, Response } from 'express';

import supabaseAdmin from '@src/services/supabase';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { getAuthenticatedUserId, userCanAccessProfile } from '@src/common/util/auth';
import { ASSISTANT_STATUS_ID } from '@src/constants/assistantStatus';

export default class AssistantStatusController {
  static async getStatus(req: Request, res: Response) {
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

    const { data, error } = await supabaseAdmin
      .from('assistant_status')
      .select('is_online, updated_at')
      .eq('id', ASSISTANT_STATUS_ID)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Failed to load assistant status', error);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to load assistant status' });
    }

    return res.status(HTTP_STATUS_CODES.Ok).json({
      isOnline: Boolean(data?.is_online),
      updatedAt: data?.updated_at ?? null,
    });
  }
}
