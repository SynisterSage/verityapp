import { Request, Response } from 'express';
import { z } from 'zod';
import logger from 'jet-logger';

import { searchProfessionalDirectory, ProfessionalLookupResponse } from '@src/services/professionalLookup';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { getAuthenticatedUserId, userCanAccessProfile } from '@src/common/util/auth';

const lookupSchema = z.object({
  q: z.string().min(1).max(200).optional(),
  limit: z.string().optional(),
});

export default class ProfessionalLookupController {
  static async search(req: Request, res: Response) {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
    }

    const { profileId } = req.params as { profileId: string };
    if (!profileId) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Missing profileId' });
    }
    if (!(await userCanAccessProfile(userId, profileId))) {
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }

    const parsed = lookupSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid query parameters' });
    }
    const { q, limit } = parsed.data;
    try {
      const options = {
        query: q,
        limit: Number(limit ?? 5),
      };
      logger.info(
        `professional lookup request profile=${profileId} query=${options.query ?? 'none'} limit=${options.limit}`
      );
      const lookupResult: ProfessionalLookupResponse = await searchProfessionalDirectory(options);
      const { providers } = lookupResult;
      logger.info(
        `professional lookup response profile=${profileId} total=${providers.length}`
      );
      return res.status(HTTP_STATUS_CODES.Ok).json({ providers });
    } catch (error) {
      logger.err(error as Error);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to lookup providers' });
    }
  }
}
