import supabaseAdmin from '@src/services/supabase';

const PIN_ATTEMPT_LIMIT = 5;
const LOCKBACKOFF_SECONDS = [30, 300, 900, 1800, 3600];

export interface PinLockState {
  locked: boolean;
  lockedUntil: Date | null;
  attempts: number;
}

function getLockDurationSeconds(attempts: number) {
  if (attempts < PIN_ATTEMPT_LIMIT) {
    return 0;
  }
  const index = Math.min(LOCKBACKOFF_SECONDS.length - 1, attempts - PIN_ATTEMPT_LIMIT);
  return LOCKBACKOFF_SECONDS[index];
}

function normalizeIp(ip?: string) {
  return ip?.trim() ? ip.trim() : 'unknown';
}

export async function getPinLockState(profileId: string, ip?: string): Promise<PinLockState> {
  const ipKey = normalizeIp(ip);
  const { data } = await supabaseAdmin
    .from('pin_attempts')
    .select('attempts, locked_until')
    .eq('profile_id', profileId)
    .eq('ip', ipKey)
    .maybeSingle();
  const now = new Date();
  if (!data) {
    return { locked: false, lockedUntil: null, attempts: 0 };
  }
  const lockedUntil = data.locked_until ? new Date(data.locked_until) : null;
  const locked = lockedUntil ? lockedUntil > now : false;
  return {
    locked,
    lockedUntil,
    attempts: data.attempts ?? 0,
  };
}

export async function recordPinAttempt(
  profileId: string,
  ip: string | undefined,
  success: boolean
): Promise<void> {
  const ipKey = normalizeIp(ip);
  const now = new Date();
  const { data } = await supabaseAdmin
    .from('pin_attempts')
    .select('attempts')
    .eq('profile_id', profileId)
    .eq('ip', ipKey)
    .maybeSingle();
  const previousAttempts = data?.attempts ?? 0;
  const attempts = success ? 0 : previousAttempts + 1;
  const lockSeconds = success ? 0 : getLockDurationSeconds(attempts);
  const lockedUntil = lockSeconds ? new Date(now.getTime() + lockSeconds * 1000) : null;

  if (success) {
    await supabaseAdmin
      .from('pin_attempts')
      .delete()
      .eq('profile_id', profileId)
      .eq('ip', ipKey);
  } else {
    await supabaseAdmin
      .from('pin_attempts')
      .upsert(
        {
          profile_id: profileId,
          ip: ipKey,
          attempts,
          locked_until: lockedUntil ? lockedUntil.toISOString() : null,
          last_attempt_at: now.toISOString(),
        },
        { onConflict: 'profile_id,ip' }
      );
  }

  await supabaseAdmin
    .from('profiles')
    .update({
      pin_locked_until: lockedUntil ? lockedUntil.toISOString() : null,
    })
    .eq('id', profileId);
}

export { PIN_ATTEMPT_LIMIT };
