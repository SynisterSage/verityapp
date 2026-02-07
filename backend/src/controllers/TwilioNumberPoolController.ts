import { Request, Response } from 'express';
import { assignNumberToProfile, getPoolStats } from '@src/services/twilioNumberPool';
import { getAuthenticatedUserId } from '@src/common/util/auth';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import supabaseAdmin from '@src/services/supabase';
import logger from 'jet-logger';

/**
 * Assign an available number from the pool to a profile
 * POST /profiles/:profileId/assign-number
 */
async function assignNumber(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const { profileId } = req.params;

  // Verify user has permission to modify this profile
  const { data: membership } = await supabaseAdmin
    .from('profile_members')
    .select('role, is_caretaker')
    .eq('profile_id', profileId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ 
      error: 'You do not have access to this profile' 
    });
  }

  try {
    const result = await assignNumberToProfile(profileId);

    if (!result.success) {
      logger.warn(`Number assignment failed for profile ${profileId}: ${result.error}`);
      return res.status(HTTP_STATUS_CODES.BadRequest).json({
        error: result.error || 'Failed to assign number',
      });
    }

    logger.info(`Number ${result.phoneNumber} assigned to profile ${profileId} by user ${userId}`);

    return res.status(HTTP_STATUS_CODES.Ok).json({
      phoneNumber: result.phoneNumber,
      twilioSid: result.twilioSid,
    });
  } catch (err) {
    logger.err(`Assignment error: ${err}`);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({
      error: 'An unexpected error occurred',
    });
  }
}

/**
 * Get pool statistics (admin only for now)
 * GET /admin/twilio-numbers/stats
 */
async function getStats(req: Request, res: Response) {
  // TODO: Add proper admin auth check when admin system is built
  // For now, just return stats for any authenticated user
  
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  try {
    const stats = await getPoolStats();

    return res.status(HTTP_STATUS_CODES.Ok).json(stats);
  } catch (err) {
    logger.err(`Stats fetch error: ${err}`);
    return res.status(HTTP_STATUS_CODES.InternalServerError).json({
      error: 'Failed to fetch stats',
    });
  }
}

export default {
  assignNumber,
  getStats,
};
