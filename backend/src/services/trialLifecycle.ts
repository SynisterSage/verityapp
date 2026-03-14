const DAY_MS = 24 * 60 * 60 * 1000;
const LIKELY_TRIAL_MAX_MS = 8.5 * DAY_MS;

type TrialLifecycleState = {
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  trial_converted_at?: string | null;
  trial_reclaimed_at?: string | null;
  trial_purge_after_at?: string | null;
  trial_purged_at?: string | null;
};

type TrialLifecycleInput = {
  existing?: TrialLifecycleState | null;
  productId: string | null | undefined;
  status: string | null | undefined;
  isActive: boolean;
  purchasedAt?: string | null;
  expiresAt?: string | null;
  isTrialSignal?: boolean | null;
  nowIso?: string;
};

export type TrialLifecycleUpdate = {
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_converted_at: string | null;
  trial_reclaimed_at: string | null;
  trial_purge_after_at: string | null;
  trial_purged_at: string | null;
};

function parseIso(value?: string | null) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return timestamp;
}

function toIso(value: number | null) {
  if (!value || !Number.isFinite(value)) {
    return null;
  }
  return new Date(value).toISOString();
}

function isMonthlyProduct(productId: string | null | undefined) {
  const normalized = (productId ?? '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.includes('monthly') || normalized.includes('month');
}

function isInactiveStatus(status: string | null | undefined) {
  const normalized = (status ?? '').trim().toLowerCase();
  return normalized === 'expired' || normalized === 'cancelled' || normalized === 'inactive';
}

export function deriveTrialLifecycleUpdate(input: TrialLifecycleInput): TrialLifecycleUpdate {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const existing = input.existing ?? {};
  const monthlyProduct = isMonthlyProduct(input.productId ?? null);

  const startedAtMs = parseIso(existing.trial_started_at);
  const existingEndsAtMs = parseIso(existing.trial_ends_at);
  const purchasedAtMs = parseIso(input.purchasedAt);
  const expiresAtMs = parseIso(input.expiresAt);

  const durationMs =
    purchasedAtMs && expiresAtMs && expiresAtMs > purchasedAtMs ? expiresAtMs - purchasedAtMs : null;
  const likelyTrialByDuration = Boolean(
    monthlyProduct &&
      durationMs &&
      durationMs > 0 &&
      durationMs <= LIKELY_TRIAL_MAX_MS
  );
  const shouldStartTrial =
    monthlyProduct &&
    !startedAtMs &&
    (input.isTrialSignal === true || likelyTrialByDuration);

  let nextTrialStartedAtMs = startedAtMs;
  let nextTrialEndsAtMs = existingEndsAtMs;
  let nextTrialConvertedAtMs = parseIso(existing.trial_converted_at);
  const nextTrialReclaimedAtMs = parseIso(existing.trial_reclaimed_at);
  let nextTrialPurgeAfterAtMs = parseIso(existing.trial_purge_after_at);
  let nextTrialPurgedAtMs = parseIso(existing.trial_purged_at);

  if (shouldStartTrial) {
    nextTrialStartedAtMs = purchasedAtMs ?? nowMs;
    if (expiresAtMs) {
      nextTrialEndsAtMs = expiresAtMs;
    } else if (nextTrialStartedAtMs) {
      nextTrialEndsAtMs = nextTrialStartedAtMs + 7 * DAY_MS;
    }
  } else if (monthlyProduct && startedAtMs && input.isTrialSignal === true && expiresAtMs) {
    nextTrialEndsAtMs = expiresAtMs;
  }

  if (monthlyProduct && nextTrialStartedAtMs && !nextTrialConvertedAtMs) {
    const trialEnded = nextTrialEndsAtMs ? nowMs >= nextTrialEndsAtMs : false;
    const becamePaidRenewal = input.isActive && input.isTrialSignal === false;
    const renewedPastTrial = input.isActive && trialEnded;

    if (becamePaidRenewal || renewedPastTrial) {
      nextTrialConvertedAtMs = nowMs;
      nextTrialPurgeAfterAtMs = null;
      nextTrialPurgedAtMs = null;
    }
  }

  if (!monthlyProduct && isInactiveStatus(input.status)) {
    nextTrialPurgeAfterAtMs = null;
    nextTrialPurgedAtMs = null;
  }

  return {
    trial_started_at: toIso(nextTrialStartedAtMs),
    trial_ends_at: toIso(nextTrialEndsAtMs),
    trial_converted_at: toIso(nextTrialConvertedAtMs),
    trial_reclaimed_at: toIso(nextTrialReclaimedAtMs),
    trial_purge_after_at: toIso(nextTrialPurgeAfterAtMs),
    trial_purged_at: toIso(nextTrialPurgedAtMs),
  };
}
