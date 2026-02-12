import { Request, Response } from 'express';
import { z } from 'zod';
import logger from 'jet-logger';

import { searchProfessionalDirectory } from '@src/services/professionalLookup';
import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { getAuthenticatedUserId, userCanAccessProfile } from '@src/common/util/auth';

const lookupSchema = z.object({
  q: z.string().min(1).max(200).optional(),
  limit: z.string().optional(),
  lat: z.string().optional(),
  lon: z.string().optional(),
  radius: z.string().optional(),
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
    const { q, limit, lat, lon, radius } = parsed.data;
    try {
      const options = {
        query: q,
        limit: Number(limit ?? 5),
        radiusMeters: radius ? Number(radius) : undefined,
        lat: lat ? Number(lat) : undefined,
        lon: lon ? Number(lon) : undefined,
      };
      const results = await searchProfessionalDirectory(options);
      return res.status(HTTP_STATUS_CODES.Ok).json({ providers: results });
    } catch (error) {
      logger.err(error as Error);
      return res.status(HTTP_STATUS_CODES.InternalServerError).json({ error: 'Failed to lookup providers' });
    }
  }
}
