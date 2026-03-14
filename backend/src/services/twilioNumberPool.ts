import supabaseAdmin from '@src/services/supabase';
import logger from 'jet-logger';

interface AssignNumberResult {
  phoneNumber: string;
  twilioSid: string;
  success: boolean;
  error?: string;
}

interface PoolStats {
  available: number;
  assigned: number;
  reserved: number;
  total: number;
}

type ReleaseNumberOptions = {
  markForRestore?: boolean;
};

type ProfileNumberRow = {
  twilio_virtual_number: string | null;
  last_released_twilio_number: string | null;
};

/**
 * Atomically assign an available number from the pool to a profile
 */
export async function assignNumberToProfile(
  profileId: string
): Promise<AssignNumberResult> {
  // Check if profile already has a number
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('twilio_virtual_number, last_released_twilio_number')
    .eq('id', profileId)
    .single();

  const profileNumber = (profile as ProfileNumberRow | null) ?? null;
  if (profileNumber?.twilio_virtual_number) {
    return {
      phoneNumber: profileNumber.twilio_virtual_number,
      twilioSid: '',
      success: true,
      error: 'Profile already has a number assigned',
    };
  }

  try {
    const preferredNumber =
      typeof profileNumber?.last_released_twilio_number === 'string'
        ? profileNumber.last_released_twilio_number.trim()
        : '';
    if (preferredNumber) {
      const preferredAssignedAt = new Date().toISOString();
      const { data: preferredClaim, error: preferredClaimError } = await supabaseAdmin
        .from('twilio_number_pool')
        .update({
          status: 'assigned',
          assigned_to_profile_id: profileId,
          assigned_at: preferredAssignedAt,
          reserved_until: null,
          released_at: null,
        })
        .eq('phone_number', preferredNumber)
        .eq('status', 'available')
        .select('id, phone_number, twilio_sid')
        .maybeSingle();

      if (!preferredClaimError && preferredClaim?.phone_number) {
        const { error: preferredProfileError } = await supabaseAdmin
          .from('profiles')
          .update({
            twilio_virtual_number: preferredClaim.phone_number,
            last_released_twilio_number: null,
          })
          .eq('id', profileId);

        if (preferredProfileError) {
          await supabaseAdmin
            .from('twilio_number_pool')
            .update({
              status: 'available',
              assigned_to_profile_id: null,
              assigned_at: null,
              released_at: preferredAssignedAt,
            })
            .eq('id', preferredClaim.id);
          logger.err(`Failed to restore preferred number on profile update: ${preferredProfileError.message}`);
        } else {
          logger.info(`✅ Reassigned preferred number ${preferredClaim.phone_number} to profile ${profileId}`);
          return {
            phoneNumber: preferredClaim.phone_number,
            twilioSid: preferredClaim.twilio_sid ?? '',
            success: true,
          };
        }
      }
    }

    // Atomically claim an available number using the database function
    // This prevents race conditions when multiple users assign simultaneously
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
      'claim_available_number',
      { p_profile_id: profileId }
    );

    if (claimError) {
      logger.err(`Failed to claim number: ${claimError.message}`);
      return {
        phoneNumber: '',
        twilioSid: '',
        success: false,
        error: claimError.message || 'Failed to claim number from pool',
      };
    }

    if (!claimed || claimed.length === 0) {
      logger.warn('No available numbers in pool');
      return {
        phoneNumber: '',
        twilioSid: '',
        success: false,
        error: 'No available numbers in pool. Please contact support.',
      };
    }

    const number = claimed[0];

    // Update profile with the assigned number
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        twilio_virtual_number: number.phone_number,
        last_released_twilio_number: null,
      })
      .eq('id', profileId);

    if (profileError) {
      // Rollback: release the reservation if profile update fails
      await supabaseAdmin
        .from('twilio_number_pool')
        .update({
          status: 'available',
          assigned_to_profile_id: null,
          reserved_until: null,
        })
        .eq('id', number.id);

      logger.err(`Failed to update profile: ${profileError.message}`);
      return {
        phoneNumber: '',
        twilioSid: '',
        success: false,
        error: 'Failed to assign number to profile',
      };
    }

    // Mark as permanently assigned (move from 'reserved' to 'assigned')
    await supabaseAdmin
      .from('twilio_number_pool')
      .update({
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        reserved_until: null,
      })
      .eq('id', number.id);

    logger.info(`✅ Assigned ${number.phone_number} to profile ${profileId}`);

    return {
      phoneNumber: number.phone_number,
      twilioSid: number.twilio_sid,
      success: true,
    };
  } catch (err) {
    logger.err(`Assignment error: ${err}`);
    return {
      phoneNumber: '',
      twilioSid: '',
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during assignment',
    };
  }
}

/**
 * Get statistics about the number pool
 */
export async function getPoolStats(): Promise<PoolStats> {
  const { data, error } = await supabaseAdmin
    .from('twilio_number_pool')
    .select('status');

  if (error) {
    logger.err(`Failed to fetch pool stats: ${error.message}`);
    return { available: 0, assigned: 0, reserved: 0, total: 0 };
  }

  const stats = data.reduce(
    (acc, row) => {
      acc.total++;
      if (row.status === 'available') acc.available++;
      if (row.status === 'assigned') acc.assigned++;
      if (row.status === 'reserved') acc.reserved++;
      return acc;
    },
    { available: 0, assigned: 0, reserved: 0, total: 0 } as PoolStats
  );

  return stats;
}

/**
 * Release a number back to the pool (when a profile is deleted, for example)
 */
export async function releaseNumberFromProfile(profileId: string): Promise<boolean> {
  return releaseNumberFromProfileWithOptions(profileId);
}

export async function releaseNumberFromProfileWithOptions(
  profileId: string,
  options: ReleaseNumberOptions = {}
): Promise<boolean> {
  try {
    const { data: profile, error: profileLookupError } = await supabaseAdmin
      .from('profiles')
      .select('twilio_virtual_number')
      .eq('id', profileId)
      .maybeSingle();

    if (profileLookupError) {
      logger.err(`Failed to load profile number for release: ${profileLookupError.message}`);
      return false;
    }

    const currentNumber =
      profile && typeof profile.twilio_virtual_number === 'string'
        ? profile.twilio_virtual_number.trim()
        : '';
    if (!currentNumber) {
      return true;
    }

    const { error } = await supabaseAdmin
      .from('twilio_number_pool')
      .update({
        status: 'available',
        assigned_to_profile_id: null,
        assigned_at: null,
        reserved_until: null,
        released_at: new Date().toISOString(),
      })
      .eq('phone_number', currentNumber)
      .eq('assigned_to_profile_id', profileId);

    if (error) {
      logger.err(`Failed to release number: ${error.message}`);
      return false;
    }

    const profilePatch: Record<string, string | null> = {
      twilio_virtual_number: null,
    };
    if (options.markForRestore) {
      profilePatch.last_released_twilio_number = currentNumber;
      profilePatch.last_number_released_at = new Date().toISOString();
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update(profilePatch)
      .eq('id', profileId);
    if (profileUpdateError) {
      logger.err(`Failed to clear profile number: ${profileUpdateError.message}`);
      return false;
    }

    logger.info(`Released number for profile ${profileId}`);
    return true;
  } catch (err) {
    logger.err(`Release error: ${err}`);
    return false;
  }
}

/**
 * Cleanup expired reservations (should be run periodically)
 */
export async function cleanupExpiredReservations(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin.rpc('release_expired_reservations');

    if (error) {
      logger.err(`Cleanup failed: ${error.message}`);
      return 0;
    }

    const count = typeof data === 'number' ? data : 0;
    if (count > 0) {
      logger.info(`Cleaned up ${count} expired reservations`);
    }
    return count;
  } catch (err) {
    logger.err(`Cleanup error: ${err}`);
    return 0;
  }
}

export async function restoreOrAssignNumbersForUser(userId: string): Promise<number> {
  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, twilio_virtual_number')
    .eq('caretaker_id', userId);

  if (error) {
    throw new Error(`Failed loading owner profiles for number restore: ${error.message}`);
  }

  let restoredCount = 0;
  for (const profile of profiles ?? []) {
    if (profile.twilio_virtual_number) {
      continue;
    }
    const result = await assignNumberToProfile(profile.id);
    if (result.success) {
      restoredCount += 1;
    }
  }

  if (restoredCount > 0) {
    logger.info(`Restored/assigned numbers for ${restoredCount} profiles under user ${userId}`);
  }
  return restoredCount;
}
