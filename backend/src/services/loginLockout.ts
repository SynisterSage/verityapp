import supabaseAdmin from '@src/services/supabase';
import logger from 'jet-logger';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

interface LoginAttemptResult {
  success: boolean;
  isLocked: boolean;
  attemptsRemaining: number;
  lockedUntil?: Date;
  message: string;
}

/**
 * Check if account is locked due to too many failed attempts
 */
export async function checkAccountLock(userId: string): Promise<LoginAttemptResult> {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('login_attempts, locked_until')
    .eq('caretaker_id', userId)
    .maybeSingle();

  if (error) {
    logger.err(`Failed to check account lock: ${error.message}`);
    return {
      success: false,
      isLocked: false,
      attemptsRemaining: MAX_LOGIN_ATTEMPTS,
      message: 'Failed to check account status',
    };
  }

  if (!profile) {
    return {
      success: false,
      isLocked: false,
      attemptsRemaining: MAX_LOGIN_ATTEMPTS,
      message: 'Profile not found',
    };
  }

  // Check if currently locked
  if (profile.locked_until) {
    const lockedUntil = new Date(profile.locked_until);
    const now = new Date();

    if (now < lockedUntil) {
      const minutesRemaining = Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000);
      return {
        success: false,
        isLocked: true,
        attemptsRemaining: 0,
        lockedUntil,
        message: `Account locked. Try again in ${minutesRemaining} minutes.`,
      };
    } else {
      // Lock has expired, clear it
      await clearLoginAttempts(userId);
      return {
        success: true,
        isLocked: false,
        attemptsRemaining: MAX_LOGIN_ATTEMPTS,
        message: 'Account unlocked',
      };
    }
  }

  return {
    success: true,
    isLocked: false,
    attemptsRemaining: MAX_LOGIN_ATTEMPTS - (profile.login_attempts ?? 0),
    message: 'Account is active',
  };
}

/**
 * Record a failed login attempt
 * Locks account after MAX_LOGIN_ATTEMPTS
 */
export async function recordFailedLoginAttempt(userId: string): Promise<LoginAttemptResult> {
  // Get current attempt count
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('login_attempts, locked_until')
    .eq('caretaker_id', userId)
    .maybeSingle();

  const currentAttempts = profile?.login_attempts ?? 0;
  const newAttempts = currentAttempts + 1;
  const now = new Date();

  // Determine if we need to lock the account
  let updates: Record<string, any> = {
    login_attempts: newAttempts,
    last_failed_login_at: now.toISOString(),
  };

  if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
    updates.locked_until = lockedUntil.toISOString();
    logger.warn(`[Security] Account locked for user ${userId} after ${newAttempts} failed attempts`);
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('caretaker_id', userId);

  if (error) {
    logger.err(`Failed to record login attempt: ${error.message}`);
  }

  const attemptsRemaining = Math.max(0, MAX_LOGIN_ATTEMPTS - newAttempts);
  const isLocked = newAttempts >= MAX_LOGIN_ATTEMPTS;

  return {
    success: false,
    isLocked,
    attemptsRemaining,
    lockedUntil: isLocked
      ? new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
      : undefined,
    message: isLocked
      ? `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`
      : `Invalid credentials. ${attemptsRemaining} attempts remaining before lockout.`,
  };
}

/**
 * Clear failed login attempts on successful login
 */
export async function clearLoginAttempts(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      login_attempts: 0,
      locked_until: null,
      last_failed_login_at: null,
    })
    .eq('caretaker_id', userId);

  if (error) {
    logger.err(`Failed to clear login attempts: ${error.message}`);
  }
}

/**
 * Get login attempt info (for debugging/admin)
 */
export async function getLoginAttempts(userId: string): Promise<{
  attempts: number;
  lastAttempt?: Date;
  isLocked: boolean;
  lockedUntil?: Date;
}> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('login_attempts, last_failed_login_at, locked_until')
    .eq('caretaker_id', userId)
    .maybeSingle();

  return {
    attempts: profile?.login_attempts ?? 0,
    lastAttempt: profile?.last_failed_login_at ? new Date(profile.last_failed_login_at) : undefined,
    isLocked: !!profile?.locked_until && new Date(profile.locked_until) > new Date(),
    lockedUntil: profile?.locked_until ? new Date(profile.locked_until) : undefined,
  };
}
