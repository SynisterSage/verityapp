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
  getStoreProducts,
  purchaseStoreProduct,
  restoreStorePurchases,
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

type SubscriptionContextValue = {
  status: SubscriptionStatusSnapshot | null;
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
};

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

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
  const lastStatusFetchAtRef = useRef(0);

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
        setStatus(normalized);
        setStatusError(null);
        lastStatusFetchAtRef.current = Date.now();
        return normalized;
      } catch (err) {
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
    [session]
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
    [status?.hasActiveSubscription, verifyReceipt]
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

  useEffect(() => {
    if (!session) {
      setStatus(null);
      setProducts([]);
      setStatusError(null);
      setProductsError(null);
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

    refreshStatus()
      .catch(() => null)
      .finally(() => {
        if (!mounted) {
          return;
        }
        setIsLoadingStatus(false);
      });

    return () => {
      mounted = false;
    };
  }, [session, refreshStatus]);

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
    }),
    [
      status,
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
