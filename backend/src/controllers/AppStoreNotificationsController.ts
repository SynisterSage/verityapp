import { Request, Response } from 'express';
import logger from 'jet-logger';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';

type AppStoreNotificationBody = {
  signedPayload?: string;
};

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function parseJwsPayload(signedPayload: string) {
  const parts = signedPayload.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format');
  }

  const payloadRaw = decodeBase64Url(parts[1] ?? '');
  const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
  return payload;
}

async function receive(req: Request, res: Response) {
  const { signedPayload } = req.body as AppStoreNotificationBody;

  if (!signedPayload || typeof signedPayload !== 'string' || signedPayload.trim().length < 20) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'signedPayload is required' });
  }

  try {
    const payload = parseJwsPayload(signedPayload.trim());
    const notificationType =
      typeof payload.notificationType === 'string' ? payload.notificationType : 'unknown';
    const subtype = typeof payload.subtype === 'string' ? payload.subtype : null;
    const environment = typeof payload.environment === 'string' ? payload.environment : null;
    const notificationUUID =
      typeof payload.notificationUUID === 'string' ? payload.notificationUUID : null;

    // Do not log signed payload or transaction identifiers.
    logger.info(
      `[AppleASN] received type=${notificationType} subtype=${subtype ?? 'none'} env=${environment ?? 'unknown'} uuid=${notificationUUID ?? 'none'}`
    );

    return res.status(HTTP_STATUS_CODES.Ok).json({ received: true });
  } catch (error) {
    logger.warn('[AppleASN] invalid payload received');
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Invalid signedPayload' });
  }
}

export default {
  receive,
};
