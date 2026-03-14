import { Request, Response } from 'express';
import logger from 'jet-logger';

import HTTP_STATUS_CODES from '@src/common/constants/HTTP_STATUS_CODES';
import { getAuthenticatedUserId } from '@src/common/util/auth';
import { verifyAppleSubscriptionReceipt } from '@src/services/appleSubscriptions';
import { getAppStoreServerTransactionById } from '@src/services/appStoreServerApi';
import {
  getSubscriptionAccessSnapshot,
  getUserSubscription,
  type UserSubscriptionRow,
} from '@src/services/subscriptionAccess';
import supabaseAdmin from '@src/services/supabase';
import { deriveTrialLifecycleUpdate } from '@src/services/trialLifecycle';
import { restoreOrAssignNumbersForUser } from '@src/services/twilioNumberPool';

const DEFAULT_PRODUCT_IDS = ['verityprotect_monthly', 'verityprotect_annual'];
const ALLOWED_PRODUCT_IDS = new Set(
  (process.env.APPLE_SUBSCRIPTION_PRODUCT_IDS ?? DEFAULT_PRODUCT_IDS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const SUBSCRIPTION_STATUS_VALUES = new Set([
  'active',
  'inactive',
  'expired',
  'cancelled',
  'billing_retry',
  'unknown',
]);

function isAllowedProductId(productId: string) {
  if (ALLOWED_PRODUCT_IDS.size === 0) {
    return true;
  }
  return ALLOWED_PRODUCT_IDS.has(productId);
}

function normalizeSubscriptionStatus(
  value: string | null | undefined,
  fallback: 'inactive' | 'unknown' = 'unknown'
) {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (!SUBSCRIPTION_STATUS_VALUES.has(normalized)) {
    return fallback;
  }
  return normalized;
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
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    trialConvertedAt: row.trial_converted_at,
    trialReclaimedAt: row.trial_reclaimed_at,
    trialPurgeAfterAt: row.trial_purge_after_at,
    trialPurgedAt: row.trial_purged_at,
    lastVerifiedAt: row.last_verified_at,
  };
}

function toLogMessage(context: string, error: unknown) {
  if (error instanceof Error && error.message) {
    return `[${context}] ${error.message}`;
  }
  if (typeof error === 'object' && error !== null) {
    const maybeMessage =
      'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : null;
    const maybeCode =
      'code' in error && typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null;
    if (maybeMessage && maybeCode) {
      return `[${context}] ${maybeCode}: ${maybeMessage}`;
    }
    if (maybeMessage) {
      return `[${context}] ${maybeMessage}`;
    }
  }
  return `[${context}] unknown_error`;
}

function parseTrialSignal(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
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

    if (access.hasActiveSubscription && subscription?.trial_reclaimed_at) {
      try {
        await restoreOrAssignNumbersForUser(userId);
      } catch (restoreError) {
        logger.warn(toLogMessage('subscriptions.verify.restore_numbers', restoreError));
      }
    }

    return res.status(HTTP_STATUS_CODES.Ok).json({
      hasActiveSubscription: access.hasActiveSubscription,
      requiresPaidMembership: access.requiresPaidMembership,
      ownerProfileCount: access.ownerProfileCount,
      memberProfileCount: access.memberProfileCount,
      canJoinWithInviteCode: true,
      subscription: serializeSubscription(subscription),
    });
  } catch (error) {
    logger.err(toLogMessage('subscriptions.status', error));
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

  const normalizedReceiptData =
    typeof receiptData === 'string' && receiptData.trim().length > 0 ? receiptData.trim() : null;
  const normalizedTransactionId =
    typeof transactionId === 'string' && transactionId.trim().length > 0 ? transactionId.trim() : null;

  if (!normalizedReceiptData && !normalizedTransactionId) {
    return res
      .status(HTTP_STATUS_CODES.BadRequest)
      .json({ error: 'receiptData or transactionId is required' });
  }

  const existing = await getUserSubscription(userId);

  try {
    let verification:
      | Awaited<ReturnType<typeof verifyAppleSubscriptionReceipt>>
      | {
          status: number | null;
          environment: string | null;
          latestReceiptData: string | null;
          subscription: null;
        };

    if (normalizedReceiptData) {
      verification = await verifyAppleSubscriptionReceipt(normalizedReceiptData);
    } else {
      verification = {
        status: null,
        environment: null,
        latestReceiptData: null,
        subscription: null,
      };
    }

    const verifiedSubscription = verification.subscription;
    let serverTransaction:
      | Awaited<ReturnType<typeof getAppStoreServerTransactionById>>
      | null = null;
    let serverTransactionLookupFailed = false;

    if (normalizedTransactionId) {
      try {
        serverTransaction = await getAppStoreServerTransactionById(normalizedTransactionId);
      } catch (serverErr) {
        serverTransactionLookupFailed = true;
        logger.warn(toLogMessage('subscriptions.verify.app_store_server_api', serverErr));
      }
    }

    if (serverTransaction?.productId && !isAllowedProductId(serverTransaction.productId)) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Unsupported productId' });
    }
    if (productId && !isAllowedProductId(productId)) {
      return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Unsupported productId' });
    }

    const hasReceiptActiveSubscription = Boolean(verifiedSubscription?.isActive);
    const hasServerActiveSubscription = Boolean(serverTransaction?.isActive);
    const isActive = hasReceiptActiveSubscription || hasServerActiveSubscription;

    const nextStatus = hasServerActiveSubscription
      ? 'active'
      : normalizeSubscriptionStatus(verifiedSubscription?.status ?? null, 'inactive');
    const source = hasServerActiveSubscription ? 'app_store_server_api' : 'app_store';
    const nowIso = new Date().toISOString();
    const resolvedProductId =
      serverTransaction?.productId ?? verifiedSubscription?.productId ?? productId ?? existing?.product_id ?? null;
    const resolvedPurchasedAt =
      serverTransaction?.purchaseDate ?? verifiedSubscription?.purchasedAt ?? existing?.purchased_at ?? null;
    const resolvedExpiresAt =
      serverTransaction?.expiresDate ?? verifiedSubscription?.expiresAt ?? existing?.expires_at ?? null;
    const trialSignal =
      parseTrialSignal(verifiedSubscription?.isTrialPeriod) ??
      parseTrialSignal(serverTransaction?.isTrialPeriod);
    const trialLifecycle = deriveTrialLifecycleUpdate({
      existing,
      productId: resolvedProductId,
      status: nextStatus,
      isActive,
      purchasedAt: resolvedPurchasedAt,
      expiresAt: resolvedExpiresAt,
      isTrialSignal: trialSignal,
      nowIso,
    });

    const { error: upsertError } = await supabaseAdmin
      .from('user_subscriptions')
      .upsert(
        {
          user_id: userId,
          platform: typeof platform === 'string' && platform.trim() ? platform.trim() : 'ios',
          source,
          status: nextStatus,
          is_active: isActive,
          product_id: resolvedProductId,
          transaction_id:
            serverTransaction?.transactionId ??
            verifiedSubscription?.transactionId ??
            normalizedTransactionId,
          original_transaction_id:
            serverTransaction?.originalTransactionId ??
            verifiedSubscription?.originalTransactionId ??
            originalTransactionId ??
            null,
          purchased_at: resolvedPurchasedAt,
          expires_at: resolvedExpiresAt,
          verification_environment: serverTransaction?.environment ?? verification.environment ?? null,
          latest_receipt_status: verification.status,
          latest_receipt_data: verification.latestReceiptData ?? normalizedReceiptData,
          metadata: {
            ...(existing?.metadata ?? {}),
            verifyRequestProductId: productId ?? null,
            verifyRequestTransactionId: normalizedTransactionId,
            verifyRequestOriginalTransactionId: originalTransactionId ?? null,
            hasVerifiedSubscription: Boolean(verifiedSubscription),
            hasServerTransaction: Boolean(serverTransaction),
            serverTransactionLookupFailed,
            receiptTrialSignal: verifiedSubscription?.isTrialPeriod ?? null,
            serverTrialSignal: serverTransaction?.isTrialPeriod ?? null,
            verificationMethod:
              hasServerActiveSubscription || Boolean(serverTransaction)
                ? 'app_store_server_api'
                : normalizedReceiptData
                  ? 'verify_receipt'
                  : 'none',
          },
          ...trialLifecycle,
          last_verified_at: nowIso,
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      logger.err(toLogMessage('subscriptions.verify.upsert', upsertError));
      return res
        .status(HTTP_STATUS_CODES.InternalServerError)
        .json({ error: 'Failed to persist subscription verification' });
    }

    const [access, subscription] = await Promise.all([
      getSubscriptionAccessSnapshot(userId),
      getUserSubscription(userId),
    ]);

    return res.status(HTTP_STATUS_CODES.Ok).json({
      verified:
        (verification.status === 0 && Boolean(verifiedSubscription)) || Boolean(serverTransaction?.isActive),
      hasActiveSubscription: access.hasActiveSubscription,
      requiresPaidMembership: access.requiresPaidMembership,
      ownerProfileCount: access.ownerProfileCount,
      memberProfileCount: access.memberProfileCount,
      canJoinWithInviteCode: true,
      subscription: serializeSubscription(subscription),
      receiptStatus: verification.status,
      verificationSource: source,
    });
  } catch (error) {
    if (normalizedTransactionId) {
      try {
        const serverTransaction = await getAppStoreServerTransactionById(normalizedTransactionId);
        if (serverTransaction && (!serverTransaction.productId || isAllowedProductId(serverTransaction.productId))) {
          const nowIso = new Date().toISOString();
          const nextStatus = normalizeSubscriptionStatus(serverTransaction.status, 'unknown');
          const isActive = Boolean(serverTransaction.isActive);
          const trialLifecycle = deriveTrialLifecycleUpdate({
            existing,
            productId: serverTransaction.productId ?? productId ?? existing?.product_id ?? null,
            status: nextStatus,
            isActive,
            purchasedAt: serverTransaction.purchaseDate ?? existing?.purchased_at ?? null,
            expiresAt: serverTransaction.expiresDate ?? existing?.expires_at ?? null,
            isTrialSignal: parseTrialSignal(serverTransaction.isTrialPeriod),
            nowIso,
          });
          const { error: upsertError } = await supabaseAdmin.from('user_subscriptions').upsert(
            {
              user_id: userId,
              platform: typeof platform === 'string' && platform.trim() ? platform.trim() : 'ios',
              source: 'app_store_server_api',
              status: nextStatus,
              is_active: isActive,
              product_id: serverTransaction.productId ?? productId ?? null,
              transaction_id: serverTransaction.transactionId ?? normalizedTransactionId,
              original_transaction_id:
                serverTransaction.originalTransactionId ?? originalTransactionId ?? null,
              purchased_at: serverTransaction.purchaseDate ?? null,
              expires_at: serverTransaction.expiresDate ?? null,
              verification_environment: serverTransaction.environment ?? null,
              latest_receipt_status: null,
              latest_receipt_data: normalizedReceiptData,
              metadata: {
                ...(existing?.metadata ?? {}),
                verifyRequestProductId: productId ?? null,
                verifyRequestTransactionId: normalizedTransactionId,
                verifyRequestOriginalTransactionId: originalTransactionId ?? null,
                hasVerifiedSubscription: false,
                hasServerTransaction: true,
                serverTrialSignal: serverTransaction.isTrialPeriod ?? null,
                verificationMethod: 'app_store_server_api_fallback_after_error',
              },
              ...trialLifecycle,
              last_verified_at: nowIso,
            },
            { onConflict: 'user_id' }
          );

          if (upsertError) {
            logger.err(toLogMessage('subscriptions.verify.fallback_upsert', upsertError));
            return res
              .status(HTTP_STATUS_CODES.InternalServerError)
              .json({ error: 'Failed to persist subscription verification' });
          }

          const [access, subscription] = await Promise.all([
            getSubscriptionAccessSnapshot(userId),
            getUserSubscription(userId),
          ]);

          if (access.hasActiveSubscription && subscription?.trial_reclaimed_at) {
            try {
              await restoreOrAssignNumbersForUser(userId);
            } catch (restoreError) {
              logger.warn(toLogMessage('subscriptions.verify.fallback_restore_numbers', restoreError));
            }
          }

          return res.status(HTTP_STATUS_CODES.Ok).json({
            verified: Boolean(serverTransaction.isActive),
            hasActiveSubscription: access.hasActiveSubscription,
            requiresPaidMembership: access.requiresPaidMembership,
            ownerProfileCount: access.ownerProfileCount,
            memberProfileCount: access.memberProfileCount,
            canJoinWithInviteCode: true,
            subscription: serializeSubscription(subscription),
            receiptStatus: null,
            verificationSource: 'app_store_server_api',
          });
        }
      } catch (fallbackError) {
        logger.err(toLogMessage('subscriptions.verify.fallback', fallbackError));
      }
    }

    logger.err(toLogMessage('subscriptions.verify', error));
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
    transactionId?: string;
    originalTransactionId?: string;
    purchasedAt?: string;
    expiresAt?: string;
  };

  if (!isAllowedProductId(productId)) {
    return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Unsupported productId' });
  }

  const existing = await getUserSubscription(userId);
  const nowIso = new Date().toISOString();
  const normalizedTransactionId =
    typeof transactionId === 'string' && transactionId.trim().length > 0 ? transactionId.trim() : null;
  let serverTransaction:
    | Awaited<ReturnType<typeof getAppStoreServerTransactionById>>
    | null = null;
  let serverTransactionLookupFailed = false;

  if (normalizedTransactionId) {
    try {
      serverTransaction = await getAppStoreServerTransactionById(normalizedTransactionId);
      if (serverTransaction?.productId && !isAllowedProductId(serverTransaction.productId)) {
        return res.status(HTTP_STATUS_CODES.BadRequest).json({ error: 'Unsupported productId' });
      }
    } catch (error) {
      serverTransactionLookupFailed = true;
      logger.warn(toLogMessage('subscriptions.sync_entitlement.app_store_server_api', error));
    }
  }

  // When no server transaction is available, derive is_active from the
  // frontend-provided expiresAt (StoreKit entitlement) so that a valid
  // entitlement with a future expiry is never left stuck as inactive due
  // to a transient App Store Server API failure.
  const entitlementExpiresAt =
    typeof expiresAt === 'string' && expiresAt.trim().length > 0 ? expiresAt.trim() : null;
  const entitlementIsActiveByClaim =
    entitlementExpiresAt !== null && Date.parse(entitlementExpiresAt) > Date.now();

  const nextStatus = serverTransaction
    ? normalizeSubscriptionStatus(serverTransaction.status, 'unknown')
    : normalizeSubscriptionStatus(existing?.status ?? null, 'unknown');
  const nextSource = serverTransaction
    ? 'app_store_server_api'
    : existing?.source ?? 'storekit_local_entitlement';
  const nextIsActive = serverTransaction
    ? Boolean(serverTransaction.isActive)
    : entitlementIsActiveByClaim || Boolean(existing?.is_active);
  const resolvedProductId = serverTransaction?.productId ?? productId ?? existing?.product_id ?? null;
  const resolvedPurchasedAt = serverTransaction?.purchaseDate ?? purchasedAt ?? existing?.purchased_at ?? null;
  const resolvedExpiresAt = serverTransaction?.expiresDate ?? expiresAt ?? existing?.expires_at ?? null;
  const trialLifecycle = deriveTrialLifecycleUpdate({
    existing,
    productId: resolvedProductId,
    status: nextStatus,
    isActive: nextIsActive,
    purchasedAt: resolvedPurchasedAt,
    expiresAt: resolvedExpiresAt,
    isTrialSignal: parseTrialSignal(serverTransaction?.isTrialPeriod),
    nowIso,
  });

  const { error: upsertError } = await supabaseAdmin.from('user_subscriptions').upsert(
    {
      user_id: userId,
      platform: typeof platform === 'string' && platform.trim() ? platform.trim() : 'ios',
      source: nextSource,
      status: nextStatus,
      is_active: nextIsActive,
      product_id: resolvedProductId,
      transaction_id: serverTransaction?.transactionId ?? normalizedTransactionId,
      original_transaction_id:
        serverTransaction?.originalTransactionId ?? originalTransactionId ?? null,
      purchased_at: resolvedPurchasedAt,
      expires_at: resolvedExpiresAt,
      verification_environment: serverTransaction?.environment ?? existing?.verification_environment ?? null,
      latest_receipt_status: existing?.latest_receipt_status ?? null,
      latest_receipt_data: existing?.latest_receipt_data ?? null,
      metadata: {
        ...(existing?.metadata ?? {}),
        appStoreServerTransaction: serverTransaction
          ? {
              environment: serverTransaction.environment,
              productId: serverTransaction.productId,
              transactionId: serverTransaction.transactionId,
              originalTransactionId: serverTransaction.originalTransactionId,
              purchaseDate: serverTransaction.purchaseDate,
              expiresDate: serverTransaction.expiresDate,
              revocationDate: serverTransaction.revocationDate,
              offerType: serverTransaction.offerType,
              offerIdentifier: serverTransaction.offerIdentifier,
              isTrialPeriod: serverTransaction.isTrialPeriod,
              status: serverTransaction.status,
              isActive: serverTransaction.isActive,
              checkedAt: nowIso,
            }
          : null,
        entitlementReport: {
          source: 'storekit_entitlement',
          reportedAt: nowIso,
          productId,
          transactionId: normalizedTransactionId,
          originalTransactionId: originalTransactionId ?? null,
          purchasedAt: purchasedAt ?? null,
          expiresAt: expiresAt ?? null,
          appStoreServerApiChecked: Boolean(normalizedTransactionId),
          appStoreServerApiLookupFailed: serverTransactionLookupFailed,
        },
      },
      ...trialLifecycle,
      last_verified_at: nowIso,
    },
    { onConflict: 'user_id' }
  );

  if (upsertError) {
    logger.err(toLogMessage('subscriptions.sync_entitlement.upsert', upsertError));
    return res
      .status(HTTP_STATUS_CODES.InternalServerError)
      .json({ error: 'Failed to persist subscription entitlement sync' });
  }

  const [access, subscription] = await Promise.all([
    getSubscriptionAccessSnapshot(userId),
    getUserSubscription(userId),
  ]);

  if (access.hasActiveSubscription && subscription?.trial_reclaimed_at) {
    try {
      await restoreOrAssignNumbersForUser(userId);
    } catch (restoreError) {
      logger.warn(toLogMessage('subscriptions.sync_entitlement.restore_numbers', restoreError));
    }
  }

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
