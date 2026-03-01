import { Request, Response } from 'express';
import logger from 'jet-logger';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import supabaseAdmin from '@src/services/supabase';

type AppStoreNotificationBody = {
  signedPayload?: string;
};

// Apple App Store Server Notification types that indicate subscription state changes
const ACTIONABLE_NOTIFICATION_TYPES = new Set([
  'DID_RENEW',
  'EXPIRED',
  'DID_FAIL_TO_RENEW',
  'DID_CHANGE_RENEWAL_STATUS',
  'REVOKE',
  'REFUND',
  'SUBSCRIBED',
  'GRACE_PERIOD_EXPIRED',
]);

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function parseJwsPayload<T = Record<string, unknown>>(signedPayload: string): T {
  const parts = signedPayload.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format');
  }

  const payloadRaw = decodeBase64Url(parts[1] ?? '');
  return JSON.parse(payloadRaw) as T;
}

type NotificationPayload = {
  notificationType?: string;
  subtype?: string;
  environment?: string;
  notificationUUID?: string;
  data?: {
    signedTransactionInfo?: string;
    appAppleId?: number;
    bundleId?: string;
  };
};

type TransactionInfo = {
  originalTransactionId?: string;
  transactionId?: string;
  productId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  environment?: string;
  appAccountToken?: string;
};

function toIso(millis?: number | null): string | null {
  if (!millis || !Number.isFinite(millis) || millis <= 0) {
    return null;
  }
  return new Date(millis).toISOString();
}

function deriveSubscriptionStatus(
  notificationType: string,
  subtype: string | null,
  transactionInfo: TransactionInfo
): { status: string; isActive: boolean } {
  const now = Date.now();
  const expiresAtMs = transactionInfo.expiresDate ?? 0;
  const isRevoked = Boolean(transactionInfo.revocationDate);

  if (isRevoked) {
    return { status: 'cancelled', isActive: false };
  }

  switch (notificationType) {
    case 'DID_RENEW':
    case 'SUBSCRIBED':
      return { status: 'active', isActive: expiresAtMs > now };
    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
      return { status: 'expired', isActive: false };
    case 'DID_FAIL_TO_RENEW':
      // Subscription is in billing retry — still active until grace period ends
      return { status: 'billing_retry', isActive: expiresAtMs > now };
    case 'REVOKE':
    case 'REFUND':
      return { status: 'cancelled', isActive: false };
    case 'DID_CHANGE_RENEWAL_STATUS':
      // Renewal preference changed; subscription remains active until expiry
      return { status: subtype === 'AUTO_RENEW_DISABLED' ? 'active' : 'active', isActive: expiresAtMs > now };
    default:
      return { status: 'unknown', isActive: expiresAtMs > now };
  }
}

async function receive(req: Request, res: Response) {
  const { signedPayload } = req.body as AppStoreNotificationBody;

  if (!signedPayload || typeof signedPayload !== 'string' || signedPayload.trim().length < 20) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'signedPayload is required' });
  }

  try {
    const payload = parseJwsPayload<NotificationPayload>(signedPayload.trim());
    const notificationType = payload.notificationType ?? 'unknown';
    const subtype = payload.subtype ?? null;
    const environment = payload.environment ?? null;
    const notificationUUID = payload.notificationUUID ?? null;

    logger.info(
      `[AppleASN] received type=${notificationType} subtype=${subtype ?? 'none'} env=${environment ?? 'unknown'} uuid=${notificationUUID ?? 'none'}`
    );

    // Only process actionable notification types
    if (!ACTIONABLE_NOTIFICATION_TYPES.has(notificationType)) {
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    const signedTransactionInfo = payload.data?.signedTransactionInfo;
    if (!signedTransactionInfo) {
      logger.warn('[AppleASN] actionable notification missing signedTransactionInfo');
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    const transactionInfo = parseJwsPayload<TransactionInfo>(signedTransactionInfo);
    const originalTransactionId = transactionInfo.originalTransactionId;

    if (!originalTransactionId) {
      logger.warn('[AppleASN] transaction info missing originalTransactionId');
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    // Look up user by original_transaction_id
    const { data: existingSubscription, error: lookupError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('user_id, product_id, status, is_active, metadata')
      .eq('original_transaction_id', originalTransactionId)
      .maybeSingle();

    if (lookupError) {
      logger.err(`[AppleASN] DB lookup error: ${lookupError.message}`);
      // Still return 200 so Apple doesn't retry; we'll recover on next app launch
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    if (!existingSubscription) {
      // No matching subscription found — user may not have synced yet
      logger.info(`[AppleASN] no subscription found for originalTransactionId, skipping update`);
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    const { status, isActive } = deriveSubscriptionStatus(notificationType, subtype, transactionInfo);
    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('user_subscriptions')
      .update({
        status,
        is_active: isActive,
        transaction_id: transactionInfo.transactionId ?? null,
        product_id: transactionInfo.productId ?? existingSubscription.product_id,
        purchased_at: toIso(transactionInfo.purchaseDate),
        expires_at: toIso(transactionInfo.expiresDate),
        verification_environment: transactionInfo.environment ?? environment,
        source: 'app_store_server_notification',
        last_verified_at: nowIso,
        metadata: {
          ...(existingSubscription.metadata ?? {}),
          lastNotification: {
            type: notificationType,
            subtype,
            uuid: notificationUUID,
            environment,
            receivedAt: nowIso,
          },
        },
      })
      .eq('user_id', existingSubscription.user_id);

    if (updateError) {
      logger.err(`[AppleASN] DB update error: ${updateError.message}`);
      return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
    }

    logger.info(
      `[AppleASN] updated subscription status=${status} isActive=${isActive} for originalTransactionId ending ...${originalTransactionId.slice(-6)}`
    );

    return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    logger.warn(`[AppleASN] processing error: ${message}`);
    // Return 200 to prevent Apple retry loops for malformed payloads
    return res.status(HTTP_STATUS_CODES.Ok).json({ received: true, processed: false });
  }
}

export default {
  receive,
};
