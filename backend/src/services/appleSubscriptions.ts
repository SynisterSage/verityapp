import fetch from 'node-fetch';

const APPLE_VERIFY_PRODUCTION_URL =
  process.env.APPLE_VERIFY_RECEIPT_PRODUCTION_URL ?? 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_VERIFY_SANDBOX_URL =
  process.env.APPLE_VERIFY_RECEIPT_SANDBOX_URL ?? 'https://sandbox.itunes.apple.com/verifyReceipt';
const APPLE_SHARED_SECRET = process.env.APPLE_SHARED_SECRET ?? '';
const DEFAULT_PRODUCT_IDS = ['verityprotect_monthly', 'verityprotect_annual'];
const ALLOWED_PRODUCT_IDS = new Set(
  (process.env.APPLE_SUBSCRIPTION_PRODUCT_IDS ?? DEFAULT_PRODUCT_IDS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

type AppleReceiptTransaction = {
  product_id?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  purchase_date_ms?: string;
  expires_date_ms?: string;
  cancellation_date_ms?: string;
  is_in_billing_retry_period?: string;
  web_order_line_item_id?: string;
};

type AppleVerifyReceiptResponse = {
  status: number;
  environment?: string;
  latest_receipt?: string;
  latest_receipt_info?: AppleReceiptTransaction[];
  receipt?: {
    in_app?: AppleReceiptTransaction[];
  };
};

export type VerifiedAppleSubscription = {
  productId: string;
  transactionId: string | null;
  originalTransactionId: string | null;
  purchasedAt: string | null;
  expiresAt: string | null;
  canceledAt: string | null;
  isActive: boolean;
  isInBillingRetryPeriod: boolean;
  status: 'active' | 'expired' | 'cancelled' | 'billing_retry';
  raw: AppleReceiptTransaction;
};

export type AppleReceiptVerificationResult = {
  status: number;
  environment: string | null;
  latestReceiptData: string | null;
  subscription: VerifiedAppleSubscription | null;
};

function parseMillis(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function toIsoString(millis: number | null) {
  if (!millis) {
    return null;
  }
  return new Date(millis).toISOString();
}

function isAllowedProduct(productId?: string | null) {
  if (!productId) {
    return false;
  }
  if (ALLOWED_PRODUCT_IDS.size === 0) {
    return true;
  }
  return ALLOWED_PRODUCT_IDS.has(productId);
}

function normalizeSubscription(transaction: AppleReceiptTransaction): VerifiedAppleSubscription | null {
  const productId = typeof transaction.product_id === 'string' ? transaction.product_id.trim() : '';
  if (!productId || !isAllowedProduct(productId)) {
    return null;
  }

  const purchasedAtMs = parseMillis(transaction.purchase_date_ms);
  const expiresAtMs = parseMillis(transaction.expires_date_ms);
  const canceledAtMs = parseMillis(transaction.cancellation_date_ms);
  const isCanceled = Boolean(canceledAtMs);
  const isInBillingRetryPeriod = transaction.is_in_billing_retry_period === '1';
  const isExpired = !expiresAtMs || expiresAtMs <= Date.now();
  const isActive = !isCanceled && Boolean(expiresAtMs && expiresAtMs > Date.now());

  let status: VerifiedAppleSubscription['status'] = 'expired';
  if (isCanceled) {
    status = 'cancelled';
  } else if (isActive) {
    status = 'active';
  } else if (isInBillingRetryPeriod) {
    status = 'billing_retry';
  } else if (isExpired) {
    status = 'expired';
  }

  return {
    productId,
    transactionId: transaction.transaction_id ?? null,
    originalTransactionId: transaction.original_transaction_id ?? null,
    purchasedAt: toIsoString(purchasedAtMs),
    expiresAt: toIsoString(expiresAtMs),
    canceledAt: toIsoString(canceledAtMs),
    isActive,
    isInBillingRetryPeriod,
    status,
    raw: transaction,
  };
}

function pickLatestSubscription(response: AppleVerifyReceiptResponse): VerifiedAppleSubscription | null {
  const candidates = [
    ...(response.latest_receipt_info ?? []),
    ...(response.receipt?.in_app ?? []),
  ]
    .map((entry) => normalizeSubscription(entry))
    .filter((entry): entry is VerifiedAppleSubscription => Boolean(entry));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    const aExpiry = Date.parse(a.expiresAt ?? '') || 0;
    const bExpiry = Date.parse(b.expiresAt ?? '') || 0;
    if (aExpiry !== bExpiry) {
      return bExpiry - aExpiry;
    }
    const aPurchase = Date.parse(a.purchasedAt ?? '') || 0;
    const bPurchase = Date.parse(b.purchasedAt ?? '') || 0;
    return bPurchase - aPurchase;
  });

  return candidates[0] ?? null;
}

async function callAppleVerifyReceipt(endpoint: string, receiptData: string) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      'receipt-data': receiptData,
      password: APPLE_SHARED_SECRET,
      'exclude-old-transactions': true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Apple receipt verification request failed (${response.status})`);
  }

  return (await response.json()) as AppleVerifyReceiptResponse;
}

export async function verifyAppleSubscriptionReceipt(
  receiptData: string
): Promise<AppleReceiptVerificationResult> {
  if (!APPLE_SHARED_SECRET.trim()) {
    throw new Error('Missing APPLE_SHARED_SECRET');
  }
  if (!receiptData.trim()) {
    throw new Error('Missing receipt data');
  }

  let useSandbox = false;
  let payload: AppleVerifyReceiptResponse | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const endpoint = useSandbox ? APPLE_VERIFY_SANDBOX_URL : APPLE_VERIFY_PRODUCTION_URL;
    payload = await callAppleVerifyReceipt(endpoint, receiptData);

    if (payload.status === 21007 && !useSandbox) {
      useSandbox = true;
      continue;
    }
    if (payload.status === 21008 && useSandbox) {
      useSandbox = false;
      continue;
    }
    break;
  }

  if (!payload) {
    throw new Error('Apple receipt verification did not return a payload');
  }

  if (payload.status !== 0) {
    return {
      status: payload.status,
      environment: payload.environment ?? null,
      latestReceiptData: payload.latest_receipt ?? null,
      subscription: null,
    };
  }

  const subscription = pickLatestSubscription(payload);
  return {
    status: payload.status,
    environment: payload.environment ?? null,
    latestReceiptData: payload.latest_receipt ?? null,
    subscription,
  };
}
