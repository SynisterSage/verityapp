import supabaseAdmin from '@src/services/supabase';
import type { UserSubscriptionRow } from '@src/services/subscriptionAccess';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

export const FACILITY_PRODUCT_ID = 'verityprotect_facility_annual';
const FACILITY_CLAIM_TOKEN_ISSUER = 'verityprotect';
const FACILITY_CLAIM_TOKEN_AUDIENCE = 'facility-offer';
const DEFAULT_FACILITY_CLAIM_TOKEN_TTL = '365d';

interface FacilityRow {
  id: string
  name: string
  status: 'active' | 'inactive'
}

interface FacilityCodeRow {
  id: string
  facility_id: string
  code: string
  is_active: boolean
  expires_at: string | null
  max_redemptions: number | null
  redemption_count: number
  metadata: Record<string, unknown> | null
  facilities: FacilityRow | FacilityRow[] | null
}

interface FacilityRedemptionRow {
  id: string
  facility_code_id: string
  user_id: string
  product_id: string
  transaction_id: string | null
  original_transaction_id: string | null
  redeemed_at: string
  metadata: Record<string, unknown> | null
}

interface FacilityClaimTokenPayload extends JwtPayload {
  code?: string
  facilitySlug?: string | null
}

export interface FacilityOfferAccess {
  facilityId: string
  facilityName: string
  facilityCodeId: string
  code: string
  expiresAt: string | null
  maxRedemptions: number | null
  redemptionCount: number
}

function normalizeEmbeddedFacility(row: FacilityCodeRow['facilities']): FacilityRow | null {
  if (Array.isArray(row)) {
    return row[0] ?? null;
  }
  return row ?? null;
}

export function normalizeFacilityCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
}

export function isFacilityProductId(productId: string | null | undefined) {
  return (productId ?? '').trim().toLowerCase() === FACILITY_PRODUCT_ID;
}

function getFacilityClaimTokenSecret() {
  const secret = process.env.FACILITY_CLAIM_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error('FACILITY_CLAIM_TOKEN_SECRET is not configured');
  }
  return secret;
}

export function createFacilityOfferClaimToken(args: {
  code: string;
  facilitySlug?: string | null;
  expiresIn?: string;
}) {
  const normalizedCode = normalizeFacilityCode(args.code);
  if (!normalizedCode) {
    throw new Error('Cannot create facility claim token without a valid code');
  }

  return jwt.sign(
    {
      code: normalizedCode,
      facilitySlug: args.facilitySlug?.trim() || null,
    },
    getFacilityClaimTokenSecret(),
    {
      algorithm: 'HS256',
      issuer: FACILITY_CLAIM_TOKEN_ISSUER,
      audience: FACILITY_CLAIM_TOKEN_AUDIENCE,
      expiresIn: (args.expiresIn ??
        process.env.FACILITY_CLAIM_TOKEN_TTL ??
        DEFAULT_FACILITY_CLAIM_TOKEN_TTL) as SignOptions['expiresIn'],
    }
  );
}

export function parseFacilityOfferClaimToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const decoded = jwt.verify(trimmed, getFacilityClaimTokenSecret(), {
      algorithms: ['HS256'],
      issuer: FACILITY_CLAIM_TOKEN_ISSUER,
      audience: FACILITY_CLAIM_TOKEN_AUDIENCE,
    }) as FacilityClaimTokenPayload | string;

    if (!decoded || typeof decoded === 'string') {
      return null;
    }

    const code = typeof decoded.code === 'string' ? normalizeFacilityCode(decoded.code) : '';
    if (!code) {
      return null;
    }

    return {
      code,
      facilitySlug:
        typeof decoded.facilitySlug === 'string' && decoded.facilitySlug.trim().length > 0
          ? decoded.facilitySlug.trim()
          : null,
    };
  } catch {
    return null;
  }
}

async function loadFacilityCodeByCode(code: string) {
  const normalizedCode = normalizeFacilityCode(code);
  if (!normalizedCode) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('facility_codes')
    .select(
      'id, facility_id, code, is_active, expires_at, max_redemptions, redemption_count, metadata, facilities:facility_id ( id, name, status )'
    )
    .eq('code', normalizedCode)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as FacilityCodeRow | null) ?? null;
}

async function loadLatestRedemptionForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('facility_code_redemptions')
    .select('id, facility_code_id, user_id, product_id, transaction_id, original_transaction_id, redeemed_at, metadata')
    .eq('user_id', userId)
    .eq('product_id', FACILITY_PRODUCT_ID)
    .order('redeemed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as FacilityRedemptionRow | null) ?? null;
}

async function loadFacilityCodeById(facilityCodeId: string) {
  const { data, error } = await supabaseAdmin
    .from('facility_codes')
    .select(
      'id, facility_id, code, is_active, expires_at, max_redemptions, redemption_count, metadata, facilities:facility_id ( id, name, status )'
    )
    .eq('id', facilityCodeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as FacilityCodeRow | null) ?? null;
}

async function countRedemptions(facilityCodeId: string) {
  const { count, error } = await supabaseAdmin
    .from('facility_code_redemptions')
    .select('id', { head: true, count: 'exact' })
    .eq('facility_code_id', facilityCodeId)
    .eq('product_id', FACILITY_PRODUCT_ID);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

function toAccess(row: FacilityCodeRow, redemptionCount: number): FacilityOfferAccess | null {
  const facility = normalizeEmbeddedFacility(row.facilities);
  if (facility?.status !== 'active') {
    return null;
  }

  return {
    facilityId: facility.id,
    facilityName: facility.name,
    facilityCodeId: row.id,
    code: row.code,
    expiresAt: row.expires_at,
    maxRedemptions: row.max_redemptions,
    redemptionCount,
  };
}

function codeIsExpired(expiresAt: string | null) {
  if (!expiresAt) {
    return false;
  }
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

export async function validateFacilityOfferCode(code: string) {
  const row = await loadFacilityCodeByCode(code);
  if (!row) {
    return null;
  }
  if (!row.is_active || codeIsExpired(row.expires_at)) {
    return null;
  }

  const redemptionCount = await countRedemptions(row.id);
  if (typeof row.max_redemptions === 'number' && redemptionCount >= row.max_redemptions) {
    return null;
  }

  return toAccess(row, redemptionCount);
}

export async function authorizeFacilityOfferAccess(args: {
  userId: string;
  facilityCode?: string | null;
  existingSubscription?: UserSubscriptionRow | null;
}) {
  if (args.facilityCode) {
    return validateFacilityOfferCode(args.facilityCode);
  }

  const existingFacilityCodeId =
    typeof args.existingSubscription?.metadata?.facilityOffer === 'object' &&
    args.existingSubscription?.metadata?.facilityOffer !== null &&
    typeof (args.existingSubscription.metadata.facilityOffer as Record<string, unknown>).facilityCodeId === 'string'
      ? ((args.existingSubscription.metadata.facilityOffer as Record<string, unknown>).facilityCodeId as string)
      : null;

  if (existingFacilityCodeId) {
    const row = await loadFacilityCodeById(existingFacilityCodeId);
    if (row && row.is_active && !codeIsExpired(row.expires_at)) {
      const redemptionCount = await countRedemptions(row.id);
      return toAccess(row, redemptionCount);
    }
  }

  const priorRedemption = await loadLatestRedemptionForUser(args.userId);
  if (!priorRedemption) {
    return null;
  }

  const row = await loadFacilityCodeById(priorRedemption.facility_code_id);
  if (!row || !row.is_active || codeIsExpired(row.expires_at)) {
    return null;
  }

  const redemptionCount = await countRedemptions(row.id);
  return toAccess(row, redemptionCount);
}

export async function recordFacilityOfferRedemption(args: {
  userId: string;
  facilityOffer: FacilityOfferAccess;
  transactionId?: string | null;
  originalTransactionId?: string | null;
}) {
  const payload = {
    facility_code_id: args.facilityOffer.facilityCodeId,
    user_id: args.userId,
    product_id: FACILITY_PRODUCT_ID,
    transaction_id: args.transactionId ?? null,
    original_transaction_id: args.originalTransactionId ?? null,
    metadata: {
      facilityId: args.facilityOffer.facilityId,
      facilityName: args.facilityOffer.facilityName,
      code: args.facilityOffer.code,
    },
  };

  const { error: upsertError } = await supabaseAdmin
    .from('facility_code_redemptions')
    .upsert(payload, { onConflict: 'facility_code_id,user_id,product_id' });

  if (upsertError) {
    throw upsertError;
  }

  const redemptionCount = await countRedemptions(args.facilityOffer.facilityCodeId);
  const { error: updateError } = await supabaseAdmin
    .from('facility_codes')
    .update({ redemption_count: redemptionCount })
    .eq('id', args.facilityOffer.facilityCodeId);

  if (updateError) {
    throw updateError;
  }

  return redemptionCount;
}
