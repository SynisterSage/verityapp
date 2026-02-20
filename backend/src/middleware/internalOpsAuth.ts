import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import ENV from '@src/common/constants/ENV';
import { NODE_ENVS } from '@src/common/constants';

const INTERNAL_OPS_HEADER = 'x-internal-ops-key';
const INTERNAL_OPS_KEY = (process.env.INTERNAL_OPS_KEY ?? '').trim();

function hasValidInternalOpsKey(req: Request) {
  const provided = (req.header(INTERNAL_OPS_HEADER) ?? '').trim();
  if (!provided || !INTERNAL_OPS_KEY) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(INTERNAL_OPS_KEY);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function requireInternalOpsAccess(req: Request, res: Response, next: NextFunction) {
  if (INTERNAL_OPS_KEY) {
    if (!hasValidInternalOpsKey(req)) {
      return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
    }
    return next();
  }

  if (ENV.NodeEnv === NODE_ENVS.Production) {
    return res.status(HTTP_STATUS_CODES.Forbidden).json({ error: 'Forbidden' });
  }

  return next();
}

