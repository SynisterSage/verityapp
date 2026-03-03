import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from './AuthContext';
import { authorizedFetch } from '../services/backend';
import {
  getStoreEntitlements,
  getStoreProducts,
  purchaseStoreProduct,
  restoreStorePurchases,
  type Entitlement,
  type PurchaseResult,
  type StoreProduct,
} from '../native/Subscriptions';
import { logError, logEvent } from '../services/sentry';

const PRODUCT_IDS = ['verityprotect_monthly', 'verityprotect_annual'];

type SubscriptionRecord = {
  status: string;
  isActive: boolean;
  platform: string;
  source: string;
  productId: string | null;
  transactionId: string | null;
  originalTransactionId: string | null;
  purchasedAt: string | null;
  expiresAt: string | null;
  verificationEnvironment: string | null;
  receiptStatus: number | null;
  lastVerifiedAt: string | null;
} | null;

export type SubscriptionStatusSnapshot = {
  hasActiveSubscription: boolean;
  requiresPaidMembership: boolean;
  ownerProfileCount: number;
  memberProfileCount: number;
  canJoinWithInviteCode: boolean;
  subscription: SubscriptionRecord;
};

type PurchaseActionResult = {
  status: 'purchased' | 'pending' | 'cancelled' | 'failed';
  message?: string;
  hasActiveSubscription: boolean;
};

export type MembershipActivationNotice = {
  productId: string | null;
  planLabel: string | null;
  activatedAt: string;
};

type SubscriptionContextValue = {
  status: SubscriptionStatusSnapshot | null;
  membershipActivationNotice: MembershipActivationNotice | null;
  products: StoreProduct[];
  selectedDefaultProductId: string;
  isLoadingStatus: boolean;
  isLoadingProducts: boolean;
  isProcessingPurchase: boolean;
  hasResolvedStatus: boolean;
  statusError: string | null;
  productsError: string | null;
  refreshStatus: (options?: { silent?: boolean }) => Promise<SubscriptionStatusSnapshot | null>;
  refreshProducts: () => Promise<StoreProduct[]>;
  purchase: (productId: string) => Promise<PurchaseActionResult>;
  restore: () => Promise<PurchaseActionResult>;
  showMembershipActivationNotice: (notice: {
    productId?: string | null;
    planLabel?: string | null;
  }) => void;
  clearMembershipActivationNotice: () => void;
};

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

type ActiveEntitlementInput = {
  productId?: string | null;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  purchasedAt?: string | null;
  expiresAt?: string | null;
};

function normalizeSubscriptionStatus(raw: any): SubscriptionStatusSnapshot {
  return {
    hasActiveSubscription: Boolean(raw?.hasActiveSubscription),
    requiresPaidMembership: Boolean(raw?.requiresPaidMembership),
    ownerProfileCount:
      typeof raw?.ownerProfileCount === 'number' && Number.isFinite(raw.ownerProfileCount)
        ? raw.ownerProfileCount
        : 0,
    memberProfileCount:
      typeof raw?.memberProfileCount === 'number' && Number.isFinite(raw.memberProfileCount)
        ? raw.memberProfileCount
        : 0,
    canJoinWithInviteCode: raw?.canJoinWithInviteCode !== false,
    subscription: raw?.subscription ?? null,
  };
}

function buildActiveSnapshot(
  base: SubscriptionStatusSnapshot | null | undefined,
  entitlement: ActiveEntitlementInput,
  nowIso: string
): SubscriptionStatusSnapshot {
  return {
    hasActiveSubscription: true,
    requiresPaidMembership: false,
    ownerProfileCount: base?.ownerProfileCount ?? 0,
    memberProfileCount: base?.memberProfileCount ?? 0,
    canJoinWithInviteCode: base?.canJoinWithInviteCode ?? true,
    subscription: {
      status: 'active',
      isActive: true,
      platform: 'ios',
      source: 'storekit_local_entitlement',
      productId: entitlement.productId ?? base?.subscription?.productId ?? null,
      transactionId: entitlement.transactionId ?? base?.subscription?.transactionId ?? null,
      originalTransactionId:
        entitlement.originalTransactionId ?? base?.subscription?.originalTransactionId ?? null,
      purchasedAt: entitlement.purchasedAt ?? base?.subscription?.purchasedAt ?? null,
      expiresAt: entitlement.expiresAt ?? base?.subscription?.expiresAt ?? null,
      verificationEnvironment: base?.subscription?.verificationEnvironment ?? null,
      receiptStatus: base?.subscription?.receiptStatus ?? null,
      lastVerifiedAt: nowIso,
    },
  };
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatusSnapshot | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false);
  const [hasResolvedStatus, setHasResolvedStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [membershipActivationNotice, setMembershipActivationNotice] =
    useState<MembershipActivationNotice | null>(null);
  const lastStatusFetchAtRef = useRef(0);
  const statusRef = useRef<SubscriptionStatusSnapshot | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const toErrorMessage = useCallback((err: unknown, fallback: string) => {
    const raw = err instanceof Error && err.message.trim().length > 0 ? err.message.trim() : fallback;

    if (/ASDErrorDomain\s*Code\s*=\s*509/i.test(raw) || /No active account/i.test(raw)) {
      return 'No active App Store account found on this device. Sign in to App Store and try again.';
    }

    if (/Unable to complete request/i.test(raw)) {
      return 'App Store could not complete this request right now. Try again in a minute.';
    }

    return raw;
  }, []);

  const toProductsErrorMessage = useCallback((err: unknown) => {
    const raw = toErrorMessage(err, 'Could not load App Store plans.');
    if (/No App Store plans found for bundle/i.test(raw)) {
      return 'App Store plans are not available for this build yet. Verify this build is attached to the subscription products in App Store Connect, then retry in a few minutes.';
    }
    return raw;
  }, [toErrorMessage]);

  const applyActiveEntitlement = useCallback(
    (entitlement: ActiveEntitlementInput, options?: { fallback?: SubscriptionStatusSnapshot | null }) => {
      const nowIso = new Date().toISOString();
      setStatus((prev) => buildActiveSnapshot(prev ?? options?.fallback, entitlement, nowIso));
      setStatusError(null);
    },
    []
  );

  const getActiveStoreEntitlement = useCallback(async (): Promise<Entitlement | null> => {
    const local = await getStoreEntitlements().catch(() => ({ entitlements: [], receiptData: null }));
    return local.entitlements.find((entitlement) => entitlement.isActive) ?? null;
  }, []);

  const shouldPreserveLocalActive = useCallback((snapshot: SubscriptionStatusSnapshot | null) => {
    if (!snapshot?.hasActiveSubscription) {
      return false;
    }
    if (snapshot.subscription?.source !== 'storekit_local_entitlement') {
      return false;
    }

    const expiresAt = Date.parse(snapshot.subscription?.expiresAt ?? '');
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      return true;
    }

    const verifiedAt = Date.parse(snapshot.subscription?.lastVerifiedAt ?? '');
    if (!Number.isFinite(verifiedAt)) {
      return false;
    }
    return Date.now() - verifiedAt < 15 * 60 * 1000;
  }, []);

  const syncEntitlement = useCallback(
    async (args: {
      productId: string;
      transactionId?: string | null;
      originalTransactionId?: string | null;
      purchasedAt?: string | null;
      expiresAt?: string | null;
    }) => {
      const response = await authorizedFetch('/subscriptions/sync-entitlement', {
        method: 'POST',
        body: JSON.stringify({
          platform: 'ios',
          productId: args.productId,
          transactionId: args.transactionId ?? undefined,
          originalTransactionId: args.originalTransactionId ?? undefined,
          purchasedAt: args.purchasedAt ?? undefined,
          expiresAt: args.expiresAt ?? undefined,
        }),
      });

      const normalized = normalizeSubscriptionStatus(response);
      if (!normalized.hasActiveSubscription) {
        const activeEntitlement = await getActiveStoreEntitlement().catch(() => null);
        if (activeEntitlement) {
          const optimistic = buildActiveSnapshot(
            normalized,
            {
              productId: activeEntitlement.productId,
              transactionId: activeEntitlement.transactionId ?? args.transactionId ?? null,
              originalTransactionId:
                activeEntitlement.originalTransactionId ?? args.originalTransactionId ?? null,
              purchasedAt: activeEntitlement.purchasedAt ?? args.purchasedAt ?? null,
              expiresAt: activeEntitlement.expiresAt ?? args.expiresAt ?? null,
            },
            new Date().toISOString()
          );
          setStatus(optimistic);
          setStatusError(null);
          lastStatusFetchAtRef.current = Date.now();
          logEvent('membership_sync_entitlement_preserved_storekit_active', {
            level: 'warning',
            screen: 'SubscriptionContext',
            extra: {
              productId: activeEntitlement.productId,
              reason: 'backend_sync_returned_inactive',
            },
          });
          return optimistic;
        }
      }

      setStatus(normalized);
      setStatusError(null);
      lastStatusFetchAtRef.current = Date.now();
      return normalized;
    },
    [getActiveStoreEntitlement]
  );

  const refreshStatus = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!session) {
        setStatus(null);
        setStatusError(null);
        setHasResolvedStatus(true);
        return null;
      }

      if (!options?.silent) {
        setIsLoadingStatus(true);
      }

      try {
        const response = await authorizedFetch('/subscriptions/status');
        const normalized = normalizeSubscriptionStatus(response);

        if (!normalized.hasActiveSubscription) {
          const activeEntitlement = await getActiveStoreEntitlement();
          if (activeEntitlement) {
            try {
              const synced = await syncEntitlement({
                productId: activeEntitlement.productId,
                transactionId: activeEntitlement.transactionId ?? null,
                originalTransactionId: activeEntitlement.originalTransactionId ?? null,
                purchasedAt: activeEntitlement.purchasedAt ?? null,
                expiresAt: activeEntitlement.expiresAt ?? null,
              });
              logEvent('membership_status_reconciled_from_storekit', {
                level: 'warning',
                screen: 'SubscriptionContext',
                extra: { productId: activeEntitlement.productId, synced: true },
              });
              return synced;
            } catch (syncErr) {
              logError(syncErr, {
                screen: 'SubscriptionContext',
                extra: {
                  reason: 'sync_entitlement_failed_during_refresh',
                  productId: activeEntitlement.productId,
                },
              });

              const optimistic = buildActiveSnapshot(
                normalized,
                {
                  productId: activeEntitlement.productId,
                  transactionId: activeEntitlement.transactionId,
                  originalTransactionId: activeEntitlement.originalTransactionId,
                  purchasedAt: activeEntitlement.purchasedAt,
                  expiresAt: activeEntitlement.expiresAt,
                },
                new Date().toISOString()
              );
              setStatus(optimistic);
              setStatusError(null);
              lastStatusFetchAtRef.current = Date.now();
              logEvent('membership_status_reconciled_from_storekit', {
                level: 'warning',
                screen: 'SubscriptionContext',
                extra: { productId: activeEntitlement.productId, synced: false },
              });
              return optimistic;
            }
          }

          const previous = statusRef.current;
          if (shouldPreserveLocalActive(previous)) {
            const previousSnapshot = previous as SubscriptionStatusSnapshot;
            const held: SubscriptionStatusSnapshot = {
              ...previousSnapshot,
              ownerProfileCount: normalized.ownerProfileCount,
              memberProfileCount: normalized.memberProfileCount,
              canJoinWithInviteCode: normalized.canJoinWithInviteCode,
              requiresPaidMembership: normalized.requiresPaidMembership,
            };
            setStatus(held);
            setStatusError(null);
            lastStatusFetchAtRef.current = Date.now();
            logEvent('membership_status_preserved_local_active', {
              level: 'warning',
              screen: 'SubscriptionContext',
              extra: {
                reason: 'backend_inactive_without_entitlement',
                productId: previous?.subscription?.productId ?? null,
              },
            });
            return held;
          }
        }

        setStatus(normalized);
        setStatusError(null);
        lastStatusFetchAtRef.current = Date.now();
        return normalized;
      } catch (err) {
        const activeEntitlement = await getActiveStoreEntitlement();
        if (activeEntitlement) {
          try {
            const synced = await syncEntitlement({
              productId: activeEntitlement.productId,
              transactionId: activeEntitlement.transactionId ?? null,
              originalTransactionId: activeEntitlement.originalTransactionId ?? null,
              purchasedAt: activeEntitlement.purchasedAt ?? null,
              expiresAt: activeEntitlement.expiresAt ?? null,
            });
            logEvent('membership_status_failed_recovered_from_storekit', {
              level: 'warning',
              screen: 'SubscriptionContext',
              extra: { productId: activeEntitlement.productId, synced: true },
            });
            return synced;
          } catch (syncErr) {
            logError(syncErr, {
              screen: 'SubscriptionContext',
              extra: {
                reason: 'sync_entitlement_failed_after_refresh_error',
                productId: activeEntitlement.productId,
              },
            });

            const optimistic = buildActiveSnapshot(
              null,
              {
                productId: activeEntitlement.productId,
                transactionId: activeEntitlement.transactionId,
                originalTransactionId: activeEntitlement.originalTransactionId,
                purchasedAt: activeEntitlement.purchasedAt,
                expiresAt: activeEntitlement.expiresAt,
              },
              new Date().toISOString()
            );
            setStatus(optimistic);
            setStatusError(null);
            lastStatusFetchAtRef.current = Date.now();
            logEvent('membership_status_failed_recovered_from_storekit', {
              level: 'warning',
              screen: 'SubscriptionContext',
              extra: { productId: activeEntitlement.productId, synced: false },
            });
            return optimistic;
          }
        }

        const previous = statusRef.current;
        if (shouldPreserveLocalActive(previous)) {
          const previousSnapshot = previous as SubscriptionStatusSnapshot;
          setStatus(previousSnapshot);
          setStatusError(null);
          lastStatusFetchAtRef.current = Date.now();
          logEvent('membership_status_preserved_on_refresh_error', {
            level: 'warning',
            screen: 'SubscriptionContext',
            extra: {
              reason: 'status_refresh_failed',
              productId: previousSnapshot.subscription?.productId ?? null,
            },
          });
          return previousSnapshot;
        }

        const message = err instanceof Error ? err.message : 'Failed to load membership status';
        setStatusError(message);
        logError(err, {
          screen: 'SubscriptionContext',
          extra: { reason: 'refresh_status_failed', message },
        });
        return null;
      } finally {
        setHasResolvedStatus(true);
        if (!options?.silent) {
          setIsLoadingStatus(false);
        }
      }
    },
    [getActiveStoreEntitlement, session, shouldPreserveLocalActive, syncEntitlement]
  );

  const refreshProducts = useCallback(async () => {
    if (!session) {
      setProducts([]);
      setProductsError(null);
      return [];
    }

    setIsLoadingProducts(true);
    try {
      const nativeProducts = await getStoreProducts(PRODUCT_IDS);
      const sortedProducts = [...nativeProducts].sort((a, b) => {
        const aIndex = PRODUCT_IDS.indexOf(a.productId);
        const bIndex = PRODUCT_IDS.indexOf(b.productId);
        return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
      });

      const availableIds = new Set(sortedProducts.map((product) => product.productId));
      const missingIds = PRODUCT_IDS.filter((id) => !availableIds.has(id));
      setProducts(sortedProducts);
      if (missingIds.length > 0 && sortedProducts.length > 0) {
        const partialMessage =
          'Some plans are still syncing from App Store Connect. Available plans can be purchased now; missing plans should appear shortly.';
        setProductsError(partialMessage);
        logEvent('membership_products_partial', {
          level: 'warning',
          screen: 'SubscriptionContext',
          extra: { missingIds: missingIds.join(','), availableCount: sortedProducts.length },
        });
      } else {
        setProductsError(null);
      }
      logEvent('membership_products_loaded', {
        screen: 'SubscriptionContext',
        extra: { count: sortedProducts.length },
      });
      return sortedProducts;
    } catch (err) {
      const message = toProductsErrorMessage(err);
      logError(err, {
        screen: 'SubscriptionContext',
        extra: { reason: 'refresh_products_failed', message },
      });
      logEvent('membership_products_load_failed', {
        screen: 'SubscriptionContext',
        extra: { message },
      });
      setProductsError(message);
      setProducts([]);
      return [];
    } finally {
      setIsLoadingProducts(false);
    }
  }, [session, toProductsErrorMessage]);

  const verifyReceipt = useCallback(
    async (args: {
      receiptData: string;
      productId?: string | null;
      transactionId?: string | null;
      originalTransactionId?: string | null;
    }) => {
      const payload = {
        receiptData: args.receiptData,
        platform: 'ios',
        productId: args.productId ?? undefined,
        transactionId: args.transactionId ?? undefined,
        originalTransactionId: args.originalTransactionId ?? undefined,
      };

      const response = await authorizedFetch('/subscriptions/verify', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const normalized = normalizeSubscriptionStatus(response);
      setStatus(normalized);
      setStatusError(null);
      lastStatusFetchAtRef.current = Date.now();
      return normalized;
    },
    []
  );

  const mapPurchaseOutcome = useCallback(
    async (result: PurchaseResult): Promise<PurchaseActionResult> => {
      if (result.status === 'cancelled') {
        return {
          status: 'cancelled',
          message: 'Purchase canceled.',
          hasActiveSubscription: Boolean(status?.hasActiveSubscription),
        };
      }
      if (result.status === 'pending') {
        return {
          status: 'pending',
          message: 'Purchase is pending approval.',
          hasActiveSubscription: Boolean(status?.hasActiveSubscription),
        };
      }
      if (result.status !== 'purchased') {
        return {
          status: 'failed',
          message: result.message ?? 'Purchase failed. Try again.',
          hasActiveSubscription: Boolean(status?.hasActiveSubscription),
        };
      }

      const receiptData =
        typeof result.receiptData === 'string' && result.receiptData.trim().length > 0
          ? result.receiptData.trim()
          : null;

      if (!receiptData) {
        if (result.hasActiveEntitlement) {
          const entitlement =
            result.activeEntitlement && typeof result.activeEntitlement === 'object'
              ? result.activeEntitlement
              : null;
          const entitlementPayload = {
            productId: entitlement?.productId ?? result.productId,
            transactionId: entitlement?.transactionId ?? result.transactionId,
            originalTransactionId: entitlement?.originalTransactionId ?? result.originalTransactionId,
            purchasedAt: entitlement?.purchasedAt ?? null,
            expiresAt: entitlement?.expiresAt ?? null,
          };
          applyActiveEntitlement(entitlementPayload);

          if (entitlementPayload.productId) {
            try {
              await syncEntitlement({
                productId: entitlementPayload.productId,
                transactionId: entitlementPayload.transactionId ?? null,
                originalTransactionId: entitlementPayload.originalTransactionId ?? null,
                purchasedAt: entitlementPayload.purchasedAt ?? null,
                expiresAt: entitlementPayload.expiresAt ?? null,
              });
            } catch (syncErr) {
              logError(syncErr, {
                screen: 'SubscriptionContext',
                extra: {
                  reason: 'sync_entitlement_failed_after_purchase',
                  productId: entitlementPayload.productId,
                },
              });
            }
          }
          logEvent('membership_receipt_missing_used_local_entitlement', {
            level: 'warning',
            screen: 'SubscriptionContext',
            extra: {
              productId: result.productId ?? null,
            },
          });
          return {
            status: 'purchased',
            message: 'Membership activated from App Store entitlement.',
            hasActiveSubscription: true,
          };
        }

        return {
          status: 'failed',
          message: 'Could not verify purchase receipt. Try restore purchase.',
          hasActiveSubscription: Boolean(status?.hasActiveSubscription),
        };
      }

      const snapshot = await verifyReceipt({
        receiptData,
        productId: result.productId,
        transactionId: result.transactionId,
        originalTransactionId: result.originalTransactionId,
      });

      const hasActiveSubscription = Boolean(snapshot.hasActiveSubscription);
      return {
        status: hasActiveSubscription ? 'purchased' : 'failed',
        message: hasActiveSubscription
          ? 'Membership activated.'
          : 'Purchase found, but membership is not active yet.',
        hasActiveSubscription,
      };
    },
    [applyActiveEntitlement, status?.hasActiveSubscription, syncEntitlement, verifyReceipt]
  );

  const purchase = useCallback(
    async (productId: string): Promise<PurchaseActionResult> => {
      setIsProcessingPurchase(true);
      logEvent('membership_purchase_started', {
        screen: 'SubscriptionContext',
        extra: { productId },
      });
      try {
        const nativeResult = await purchaseStoreProduct(productId);
        const mapped = await mapPurchaseOutcome(nativeResult);
        if (mapped.status === 'purchased') {
          setMembershipActivationNotice({
            productId,
            planLabel: null,
            activatedAt: new Date().toISOString(),
          });
        }
        logEvent('membership_purchase_result', {
          screen: 'SubscriptionContext',
          extra: {
            productId,
            status: mapped.status,
            hasActiveSubscription: mapped.hasActiveSubscription,
          },
        });
        return mapped;
      } catch (err) {
        const message = toErrorMessage(err, 'Purchase failed. Try again.');
        logError(err, {
          screen: 'SubscriptionContext',
          extra: { reason: 'purchase_failed', productId, message },
        });
        logEvent('membership_purchase_result', {
          screen: 'SubscriptionContext',
          extra: {
            productId,
            status: 'failed',
            hasActiveSubscription: Boolean(status?.hasActiveSubscription),
            message,
          },
        });
        return {
          status: 'failed',
          message,
          hasActiveSubscription: Boolean(status?.hasActiveSubscription),
        };
      } finally {
        setIsProcessingPurchase(false);
      }
    },
    [mapPurchaseOutcome, status?.hasActiveSubscription, toErrorMessage]
  );

  const restore = useCallback(async (): Promise<PurchaseActionResult> => {
    setIsProcessingPurchase(true);
    logEvent('membership_restore_started', {
      screen: 'SubscriptionContext',
    });
    try {
      const nativeResult = await restoreStorePurchases();
      const mapped = await mapPurchaseOutcome(nativeResult);
      if (mapped.status === 'purchased') {
        setMembershipActivationNotice((previous) => ({
          productId: previous?.productId ?? statusRef.current?.subscription?.productId ?? null,
          planLabel: previous?.planLabel ?? null,
          activatedAt: new Date().toISOString(),
        }));
      }
      logEvent('membership_restore_result', {
        screen: 'SubscriptionContext',
        extra: {
          status: mapped.status,
          hasActiveSubscription: mapped.hasActiveSubscription,
        },
      });
      return mapped;
    } catch (err) {
      const message = toErrorMessage(err, 'Restore failed. Try again.');
      logError(err, {
        screen: 'SubscriptionContext',
        extra: { reason: 'restore_failed', message },
      });
      logEvent('membership_restore_result', {
        screen: 'SubscriptionContext',
        extra: {
          status: 'failed',
          hasActiveSubscription: Boolean(status?.hasActiveSubscription),
          message,
        },
      });
      return {
        status: 'failed',
        message,
        hasActiveSubscription: Boolean(status?.hasActiveSubscription),
      };
    } finally {
      setIsProcessingPurchase(false);
    }
  }, [mapPurchaseOutcome, status?.hasActiveSubscription, toErrorMessage]);

  const showMembershipActivationNotice = useCallback(
    (notice: { productId?: string | null; planLabel?: string | null }) => {
      setMembershipActivationNotice({
        productId: notice.productId ?? null,
        planLabel: notice.planLabel ?? null,
        activatedAt: new Date().toISOString(),
      });
    },
    []
  );

  const clearMembershipActivationNotice = useCallback(() => {
    setMembershipActivationNotice(null);
  }, []);

  useEffect(() => {
    if (!session) {
      setStatus(null);
      setProducts([]);
      setStatusError(null);
      setProductsError(null);
      setMembershipActivationNotice(null);
      setHasResolvedStatus(true);
      setIsLoadingStatus(false);
      setIsLoadingProducts(false);
      return;
    }

    let mounted = true;
    setHasResolvedStatus(false);
    setIsLoadingStatus(true);
    // Do not force StoreKit product fetch during global app bootstrap.
    // We load plans when membership/billing UI mounts to avoid startup crashes
    // from native StoreKit invocation on some TestFlight environments.
    setIsLoadingProducts(false);

    void (async () => {
      const activeEntitlement = await getActiveStoreEntitlement();
      if (mounted && activeEntitlement) {
        applyActiveEntitlement({
          productId: activeEntitlement.productId,
          transactionId: activeEntitlement.transactionId,
          originalTransactionId: activeEntitlement.originalTransactionId,
          purchasedAt: activeEntitlement.purchasedAt,
          expiresAt: activeEntitlement.expiresAt,
        });
        setHasResolvedStatus(true);
        logEvent('membership_status_bootstrapped_from_storekit', {
          level: 'warning',
          screen: 'SubscriptionContext',
          extra: { productId: activeEntitlement.productId },
        });
      }

      await refreshStatus().catch(() => null);
      if (!mounted) {
        return;
      }
      setIsLoadingStatus(false);
    })();

    return () => {
      mounted = false;
    };
  }, [applyActiveEntitlement, getActiveStoreEntitlement, session, refreshStatus]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        return;
      }
      if (Date.now() - lastStatusFetchAtRef.current < 25_000) {
        return;
      }
      void refreshStatus({ silent: true });
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [session, refreshStatus]);

  const selectedDefaultProductId = useMemo(() => {
    if (products.some((product) => product.productId === 'verityprotect_monthly')) {
      return 'verityprotect_monthly';
    }
    return products[0]?.productId ?? 'verityprotect_monthly';
  }, [products]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      status,
      membershipActivationNotice,
      products,
      selectedDefaultProductId,
      isLoadingStatus,
      isLoadingProducts,
      isProcessingPurchase,
      hasResolvedStatus,
      statusError,
      productsError,
      refreshStatus,
      refreshProducts,
      purchase,
      restore,
      showMembershipActivationNotice,
      clearMembershipActivationNotice,
    }),
    [
      status,
      membershipActivationNotice,
      products,
      selectedDefaultProductId,
      isLoadingStatus,
      isLoadingProducts,
      isProcessingPurchase,
      hasResolvedStatus,
      statusError,
      productsError,
      refreshStatus,
      refreshProducts,
      purchase,
      restore,
      showMembershipActivationNotice,
      clearMembershipActivationNotice,
    ]
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
