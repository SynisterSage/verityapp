import supabaseAdmin from './supabase';

export type UserSubscriptionRow = {
  user_id: string;
  platform: string;
  source: string;
  status: string;
  is_active: boolean;
  product_id: string | null;
  transaction_id: string | null;
  original_transaction_id: string | null;
  purchased_at: string | null;
  expires_at: string | null;
  verification_environment: string | null;
  latest_receipt_status: number | null;
  latest_receipt_data: string | null;
  metadata: Record<string, unknown> | null;
  last_verified_at: string;
  created_at: string;
  updated_at: string;
};

export type SubscriptionAccessSnapshot = {
  hasActiveSubscription: boolean;
  ownerProfileCount: number;
  memberProfileCount: number;
  requiresPaidMembership: boolean;
};

function hasFutureExpiry(expiresAt: string | null | undefined) {
  if (!expiresAt) {
    return false;
  }
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return timestamp > Date.now();
}

export function isSubscriptionActive(row: UserSubscriptionRow | null | undefined) {
  if (!row) {
    return false;
  }
  if (!row.is_active) {
    return false;
  }
  return hasFutureExpiry(row.expires_at);
}

export async function getUserSubscription(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('user_subscriptions')
    .select(
      'user_id, platform, source, status, is_active, product_id, transaction_id, original_transaction_id, purchased_at, expires_at, verification_environment, latest_receipt_status, latest_receipt_data, metadata, last_verified_at, created_at, updated_at'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return (data as UserSubscriptionRow | null) ?? null;
}

export async function hasActiveSubscription(userId: string) {
  const subscription = await getUserSubscription(userId);
  return isSubscriptionActive(subscription);
}

export async function getSubscriptionAccessSnapshot(userId: string): Promise<SubscriptionAccessSnapshot> {
  const [subscription, ownerProfilesResult, memberProfilesResult] = await Promise.all([
    getUserSubscription(userId),
    supabaseAdmin
      .from('profiles')
      .select('id', { head: true, count: 'exact' })
      .eq('caretaker_id', userId),
    supabaseAdmin
      .from('profile_members')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', userId),
  ]);

  const ownerProfileCount = ownerProfilesResult.count ?? 0;
  const memberProfileCount = memberProfilesResult.count ?? 0;
  const requiresPaidMembership = ownerProfileCount > 0 || memberProfileCount === 0;

  return {
    hasActiveSubscription: isSubscriptionActive(subscription),
    ownerProfileCount,
    memberProfileCount,
    requiresPaidMembership,
  };
}
