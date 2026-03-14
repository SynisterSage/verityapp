import { NativeModules, Platform } from 'react-native';

export type StoreProduct = {
  productId: string;
  displayName: string;
  description: string;
  displayPrice: string;
  price: number;
  currencyCode?: string | null;
  subscriptionPeriodUnit?: 'day' | 'week' | 'month' | 'year' | null;
  subscriptionPeriodCount?: number | null;
  introOfferType?: 'free' | 'pay_as_you_go' | 'pay_up_front' | null;
  introOfferPeriodUnit?: 'day' | 'week' | 'month' | 'year' | null;
  introOfferPeriodCount?: number | null;
  introOfferCycles?: number | null;
  introOfferDisplayPrice?: string | null;
  hasFreeTrial?: boolean | null;
};

export type PurchaseResult = {
  status: 'purchased' | 'pending' | 'cancelled' | 'failed';
  productId?: string | null;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  receiptData?: string | null;
  hasActiveEntitlement?: boolean;
  activeEntitlement?: Entitlement | null;
  message?: string | null;
};

export type Entitlement = {
  productId: string;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  purchasedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  isActive: boolean;
};

const VeritySubscriptionsModule = NativeModules.VeritySubscriptionsModule as
  | {
      getProducts: (productIds: string[]) => Promise<{ products?: StoreProduct[] }>;
      purchaseProduct: (productId: string) => Promise<PurchaseResult>;
      restorePurchases: () => Promise<PurchaseResult>;
      getCurrentEntitlements: () => Promise<{ entitlements?: Entitlement[]; receiptData?: string | null }>;
    }
  | undefined;

function ensureModule() {
  if (!VeritySubscriptionsModule) {
    throw new Error('Subscriptions are unavailable on this build.');
  }
  return VeritySubscriptionsModule;
}

export async function getStoreProducts(productIds: string[]): Promise<StoreProduct[]> {
  if (Platform.OS !== 'ios') {
    return [];
  }
  const result = await ensureModule().getProducts(productIds);
  return Array.isArray(result?.products) ? result.products : [];
}

export async function purchaseStoreProduct(productId: string): Promise<PurchaseResult> {
  if (Platform.OS !== 'ios') {
    return {
      status: 'failed',
      productId,
      message: 'Purchases are only available on iOS right now.',
    };
  }
  return ensureModule().purchaseProduct(productId);
}

export async function restoreStorePurchases(): Promise<PurchaseResult> {
  if (Platform.OS !== 'ios') {
    return {
      status: 'failed',
      message: 'Restore is only available on iOS right now.',
    };
  }
  return ensureModule().restorePurchases();
}

export async function getStoreEntitlements(): Promise<{
  entitlements: Entitlement[];
  receiptData: string | null;
}> {
  if (Platform.OS !== 'ios') {
    return { entitlements: [], receiptData: null };
  }
  const result = await ensureModule().getCurrentEntitlements();
  return {
    entitlements: Array.isArray(result?.entitlements) ? result.entitlements : [],
    receiptData: typeof result?.receiptData === 'string' && result.receiptData.trim().length > 0
      ? result.receiptData.trim()
      : null,
  };
}
