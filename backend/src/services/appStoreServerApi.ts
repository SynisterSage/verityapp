import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

const APP_STORE_SERVER_PRODUCTION_BASE_URL =
  process.env.APPLE_APP_STORE_SERVER_API_PRODUCTION_URL ?? 'https://api.storekit.itunes.apple.com';
const APP_STORE_SERVER_SANDBOX_BASE_URL =
  process.env.APPLE_APP_STORE_SERVER_API_SANDBOX_URL ??
  'https://api.storekit-sandbox.itunes.apple.com';

const APP_STORE_SERVER_ISSUER_ID = (process.env.APPLE_APP_STORE_ISSUER_ID ?? '').trim();
const APP_STORE_SERVER_KEY_ID = (process.env.APPLE_APP_STORE_KEY_ID ?? '').trim();
const APP_STORE_SERVER_BUNDLE_ID = (process.env.APPLE_APP_STORE_BUNDLE_ID ?? '').trim();
const APP_STORE_SERVER_PRIVATE_KEY_RAW = (process.env.APPLE_APP_STORE_PRIVATE_KEY ?? '').trim();

type AppStoreServerTransactionResponse = {
  signedTransactionInfo?: string;
};

export type AppStoreServerTransaction = {
  environment: string | null;
  productId: string | null;
  transactionId: string | null;
  originalTransactionId: string | null;
  purchaseDate: string | null;
  expiresDate: string | null;
  revocationDate: string | null;
  isActive: boolean;
  status: 'active' | 'expired' | 'cancelled';
};

function parsePrivateKey() {
  if (!APP_STORE_SERVER_PRIVATE_KEY_RAW) {
    return '';
  }
  if (APP_STORE_SERVER_PRIVATE_KEY_RAW.includes('-----BEGIN PRIVATE KEY-----')) {
    return APP_STORE_SERVER_PRIVATE_KEY_RAW.replace(/\\n/g, '\n');
  }
  const decoded = Buffer.from(APP_STORE_SERVER_PRIVATE_KEY_RAW, 'base64').toString('utf8');
  return decoded.replace(/\\n/g, '\n');
}

function ensureServerApiConfig() {
  const privateKey = parsePrivateKey();
  if (!APP_STORE_SERVER_ISSUER_ID || !APP_STORE_SERVER_KEY_ID || !APP_STORE_SERVER_BUNDLE_ID || !privateKey) {
    throw new Error('Missing App Store Server API configuration');
  }
  return {
    issuerId: APP_STORE_SERVER_ISSUER_ID,
    keyId: APP_STORE_SERVER_KEY_ID,
    bundleId: APP_STORE_SERVER_BUNDLE_ID,
    privateKey,
  };
}

let cachedToken: { token: string; expiresAtMs: number } | null = null;

function getBearerToken() {
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAtMs - 15_000) {
    return cachedToken.token;
  }

  const cfg = ensureServerApiConfig();
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + 5 * 60;

  const token = jwt.sign(
    {
      iss: cfg.issuerId,
      iat: issuedAt,
      exp: expiresAt,
      aud: 'appstoreconnect-v1',
      bid: cfg.bundleId,
    },
    cfg.privateKey,
    {
      algorithm: 'ES256',
      keyid: cfg.keyId,
    }
  );

  cachedToken = {
    token,
    expiresAtMs: expiresAt * 1000,
  };
  return token;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function decodeJwsPayload<T>(jws: string): T {
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format');
  }
  const payloadRaw = decodeBase64Url(parts[1] ?? '');
  return JSON.parse(payloadRaw) as T;
}

type SignedTransactionPayload = {
  environment?: string;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
};

function toIso(value?: number) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value).toISOString();
}

function mapSignedTransaction(payload: SignedTransactionPayload): AppStoreServerTransaction {
  const now = Date.now();
  const expiresAtMs =
    typeof payload.expiresDate === 'number' && Number.isFinite(payload.expiresDate)
      ? payload.expiresDate
      : null;
  const revocationAtMs =
    typeof payload.revocationDate === 'number' && Number.isFinite(payload.revocationDate)
      ? payload.revocationDate
      : null;

  const isActive = Boolean(!revocationAtMs && expiresAtMs && expiresAtMs > now);
  const status: AppStoreServerTransaction['status'] = revocationAtMs
    ? 'cancelled'
    : isActive
      ? 'active'
      : 'expired';

  return {
    environment: payload.environment ?? null,
    productId: payload.productId ?? null,
    transactionId: payload.transactionId ?? null,
    originalTransactionId: payload.originalTransactionId ?? null,
    purchaseDate: toIso(payload.purchaseDate),
    expiresDate: toIso(payload.expiresDate),
    revocationDate: toIso(payload.revocationDate),
    isActive,
    status,
  };
}

async function fetchTransactionById(baseUrl: string, transactionId: string, token: string) {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, '')}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`App Store Server API transaction request failed (${response.status})`);
  }

  const payload = (await response.json()) as AppStoreServerTransactionResponse;
  if (!payload.signedTransactionInfo || payload.signedTransactionInfo.trim().length === 0) {
    return null;
  }

  const signedPayload = decodeJwsPayload<SignedTransactionPayload>(payload.signedTransactionInfo);
  return mapSignedTransaction(signedPayload);
}

export async function getAppStoreServerTransactionById(transactionId: string) {
  const trimmed = transactionId.trim();
  if (!trimmed) {
    throw new Error('Missing transactionId');
  }
  const token = getBearerToken();

  const production = await fetchTransactionById(APP_STORE_SERVER_PRODUCTION_BASE_URL, trimmed, token);
  if (production) {
    return production;
  }

  return fetchTransactionById(APP_STORE_SERVER_SANDBOX_BASE_URL, trimmed, token);
}

