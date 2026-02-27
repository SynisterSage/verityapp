import { Request, Response } from 'express';
import logger from 'jet-logger';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { getAuthenticatedUserId } from '@src/common/util/auth';
import { verifyAppleSubscriptionReceipt } from '@src/services/appleSubscriptions';
import {
  getSubscriptionAccessSnapshot,
  getUserSubscription,
  type UserSubscriptionRow,
} from '@src/services/subscriptionAccess';
import supabaseAdmin from '@src/services/supabase';

const DEFAULT_PRODUCT_IDS = ['verityprotect_monthly', 'verityprotect_annual'];
const ALLOWED_PRODUCT_IDS = new Set(
  (process.env.APPLE_SUBSCRIPTION_PRODUCT_IDS ?? DEFAULT_PRODUCT_IDS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

function isAllowedProductId(productId: string) {
  if (ALLOWED_PRODUCT_IDS.size === 0) {
    return true;
  }
  return ALLOWED_PRODUCT_IDS.has(productId);
}

function serializeSubscription(row: UserSubscriptionRow | null) {
  if (!row) {
    return null;
  }
  return {
    status: row.status,
    isActive: row.is_active,
    platform: row.platform,
    source: row.source,
    productId: row.product_id,
    transactionId: row.transaction_id,
    originalTransactionId: row.original_transaction_id,
    purchasedAt: row.purchased_at,
    expiresAt: row.expires_at,
    verificationEnvironment: row.verification_environment,
    receiptStatus: row.latest_receipt_status,
    lastVerifiedAt: row.last_verified_at,
  };
}

async function status(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  try {
    const [access, subscription] = await Promise.all([
      getSubscriptionAccessSnapshot(userId),
      getUserSubscription(userId),
    ]);

    return res.status(HTTP_STATUS_CODES.Ok).json({
      hasActiveSubscription: access.hasActiveSubscription,
      requiresPaidMembership: access.requiresPaidMembership,
      ownerProfileCount: access.ownerProfileCount,
      memberProfileCount: access.memberProfileCount,
      canJoinWithInviteCode: true,
      subscription: serializeSubscription(subscription),
    });
  } catch (error) {
    logger.err(error);
    return res
      .status(HTTP_STATUS_CODES.InternalServerError)
      .json({ error: 'Failed to load subscription status' });
  }
}

async function verify(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const {
    receiptData,
    platform,
    productId,
    transactionId,
    originalTransactionId,
  } = req.body as {
    receiptData?: string;
    platform?: string;
    productId?: string;
    transactionId?: string;
    originalTransactionId?: string;
  };

  if (!receiptData || typeof receiptData !== 'string' || receiptData.trim().length === 0) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'receiptData is required' });
  }

  try {
    const verification = await verifyAppleSubscriptionReceipt(receiptData.trim());
    const verifiedSubscription = verification.subscription;

    const nextStatus = verifiedSubscription?.status ?? 'inactive';
    const isActive = Boolean(verifiedSubscription?.isActive);

    const { error: upsertError } = await supabaseAdmin
      .from('user_subscriptions')
      .upsert(
        {
          user_id: userId,
          platform: typeof platform === 'string' && platform.trim() ? platform.trim() : 'ios',
          source: 'app_store',
          status: nextStatus,
          is_active: isActive,
          product_id: verifiedSubscription?.productId ?? productId ?? null,
          transaction_id: verifiedSubscription?.transactionId ?? transactionId ?? null,
          original_transaction_id:
            verifiedSubscription?.originalTransactionId ?? originalTransactionId ?? null,
          purchased_at: verifiedSubscription?.purchasedAt ?? null,
          expires_at: verifiedSubscription?.expiresAt ?? null,
          verification_environment: verification.environment,
          latest_receipt_status: verification.status,
          latest_receipt_data: verification.latestReceiptData ?? receiptData.trim(),
          metadata: {
            verifyRequestProductId: productId ?? null,
            verifyRequestTransactionId: transactionId ?? null,
            verifyRequestOriginalTransactionId: originalTransactionId ?? null,
            hasVerifiedSubscription: Boolean(verifiedSubscription),
          },
          last_verified_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      logger.err(upsertError);
      return res
        .status(HTTP_STATUS_CODES.InternalServerError)
        .json({ error: 'Failed to persist subscription verification' });
    }

    const [access, subscription] = await Promise.all([
      getSubscriptionAccessSnapshot(userId),
      getUserSubscription(userId),
    ]);

    return res.status(HTTP_STATUS_CODES.Ok).json({
      verified: verification.status === 0 && Boolean(verifiedSubscription),
      hasActiveSubscription: access.hasActiveSubscription,
      requiresPaidMembership: access.requiresPaidMembership,
      ownerProfileCount: access.ownerProfileCount,
      memberProfileCount: access.memberProfileCount,
      canJoinWithInviteCode: true,
      subscription: serializeSubscription(subscription),
      receiptStatus: verification.status,
    });
  } catch (error) {
    logger.err(error);
    return res
      .status(HTTP_STATUS_CODES.BadGateway)
      .json({ error: 'Subscription verification failed' });
  }
}

async function syncEntitlement(req: Request, res: Response) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return res.status(HTTP_STATUS_CODES.Unauthorized).json({ error: 'Unauthorized' });
  }

  const {
    platform,
    productId,
    transactionId,
    originalTransactionId,
    purchasedAt,
    expiresAt,
  } = req.body as {
    platform?: string;
    productId: string;
    transactionId: string;
    originalTransactionId?: string;
    purchasedAt?: string;
    expiresAt?: string;
  };

  if (!isAllowedProductId(productId)) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Unsupported productId' });
  }

  const existing = await getUserSubscription(userId);
  const nowIso = new Date().toISOString();
  const { error: upsertError } = await supabaseAdmin.from('user_subscriptions').upsert(
    {
      user_id: userId,
      platform: typeof platform === 'string' && platform.trim() ? platform.trim() : 'ios',
      source: existing?.source ?? 'storekit_local_entitlement',
      status: existing?.status ?? 'reported_unverified',
      is_active: existing?.is_active ?? false,
      product_id: productId ?? null,
      transaction_id: transactionId ?? null,
      original_transaction_id: originalTransactionId ?? null,
      purchased_at: purchasedAt ?? null,
      expires_at: expiresAt ?? null,
      verification_environment: existing?.verification_environment ?? null,
      latest_receipt_status: existing?.latest_receipt_status ?? null,
      latest_receipt_data: existing?.latest_receipt_data ?? null,
      metadata: {
        ...(existing?.metadata ?? {}),
        entitlementReport: {
          source: 'storekit_entitlement',
          reportedAt: nowIso,
          productId,
          transactionId,
          originalTransactionId: originalTransactionId ?? null,
          purchasedAt: purchasedAt ?? null,
          expiresAt: expiresAt ?? null,
        },
      },
      last_verified_at: nowIso,
    },
    { onConflict: 'user_id' }
  );

  if (upsertError) {
    logger.err(upsertError);
    return res
      .status(HTTP_STATUS_CODES.InternalServerError)
      .json({ error: 'Failed to persist subscription entitlement sync' });
  }

  const [access, subscription] = await Promise.all([
    getSubscriptionAccessSnapshot(userId),
    getUserSubscription(userId),
  ]);

  return res.status(HTTP_STATUS_CODES.Ok).json({
    hasActiveSubscription: access.hasActiveSubscription,
    requiresPaidMembership: access.requiresPaidMembership,
    ownerProfileCount: access.ownerProfileCount,
    memberProfileCount: access.memberProfileCount,
    canJoinWithInviteCode: true,
    subscription: serializeSubscription(subscription),
  });
}

export default {
  status,
  verify,
  syncEntitlement,
};
