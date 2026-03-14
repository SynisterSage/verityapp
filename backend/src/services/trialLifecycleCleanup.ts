import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import { deleteRecordingPaths } from '@src/services/callRecordingStorage';
import { releaseNumberFromProfileWithOptions } from '@src/services/twilioNumberPool';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DELETE_BATCH_SIZE = 500;
const INACTIVE_STATUSES = ['inactive', 'expired', 'cancelled'];

export type TrialLifecycleCleanupConfig = {
  enabled: boolean;
  dryRun: boolean;
  reclaimGraceHours: number;
  retentionDays: number;
  intervalMinutes: number;
  startupDelaySeconds: number;
};

export type TrialLifecycleCleanupSummary = {
  dryRun: boolean;
  reclaimedUsers: number;
  reclaimedProfiles: number;
  purgeUsers: number;
  purgedCalls: number;
  purgedAlerts: number;
  purgedRecordings: number;
};

type TrialLifecycleCleanupRow = {
  user_id: string;
  status: string;
  is_active: boolean;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function lifecycleEnabled() {
  return process.env.ENABLE_TRIAL_LIFECYCLE_CLEANUP === 'true';
}

export function getTrialLifecycleCleanupConfig(): TrialLifecycleCleanupConfig {
  return {
    enabled: lifecycleEnabled(),
    // Dry-run defaults to true for safety until explicitly disabled.
    dryRun: process.env.TRIAL_LIFECYCLE_DRY_RUN !== 'false',
    reclaimGraceHours: parsePositiveInt(process.env.TRIAL_RECLAIM_GRACE_HOURS, 24),
    retentionDays: parsePositiveInt(process.env.TRIAL_DATA_RETENTION_DAYS, 30),
    intervalMinutes: parsePositiveInt(process.env.TRIAL_LIFECYCLE_INTERVAL_MINUTES, 60),
    startupDelaySeconds: parsePositiveInt(process.env.TRIAL_LIFECYCLE_STARTUP_DELAY_SECONDS, 90),
  };
}

function isInactiveStatus(value: string | null | undefined) {
  return INACTIVE_STATUSES.includes((value ?? '').trim().toLowerCase());
}

async function deleteAlertsByProfileIds(profileIds: string[]) {
  if (profileIds.length === 0) {
    return 0;
  }
  const { count, error: countError } = await supabaseAdmin
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .in('profile_id', profileIds);
  if (countError) {
    throw new Error(`Failed counting trial alerts for purge: ${countError.message}`);
  }

  let deleted = 0;
  for (let i = 0; i < profileIds.length; i += 50) {
    const batch = profileIds.slice(i, i + 50);
    const { error } = await supabaseAdmin.from('alerts').delete().in('profile_id', batch);
    if (error) {
      throw new Error(`Failed deleting trial alerts for purge: ${error.message}`);
    }
  }
  deleted += count ?? 0;
  return deleted;
}

async function deleteCallsByIds(callIds: string[]) {
  if (callIds.length === 0) {
    return;
  }
  for (let i = 0; i < callIds.length; i += DELETE_BATCH_SIZE) {
    const batch = callIds.slice(i, i + DELETE_BATCH_SIZE);
    const { error } = await supabaseAdmin.from('calls').delete().in('id', batch);
    if (error) {
      throw new Error(`Failed deleting trial calls for purge: ${error.message}`);
    }
  }
}

export async function runTrialLifecycleCleanup(
  partialConfig: Partial<Pick<TrialLifecycleCleanupConfig, 'dryRun' | 'reclaimGraceHours' | 'retentionDays'>> = {}
): Promise<TrialLifecycleCleanupSummary> {
  const config = getTrialLifecycleCleanupConfig();
  const dryRun = partialConfig.dryRun ?? config.dryRun;
  const reclaimGraceHours = partialConfig.reclaimGraceHours ?? config.reclaimGraceHours;
  const retentionDays = partialConfig.retentionDays ?? config.retentionDays;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const reclaimCutoffIso = new Date(now - reclaimGraceHours * HOUR_MS).toISOString();
  const purgeAfterIso = new Date(now + retentionDays * DAY_MS).toISOString();

  const { data: reclaimRows, error: reclaimRowsError } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id, status, is_active')
    .not('trial_started_at', 'is', null)
    .is('trial_converted_at', null)
    .is('trial_reclaimed_at', null)
    .not('trial_ends_at', 'is', null)
    .lte('trial_ends_at', reclaimCutoffIso);

  if (reclaimRowsError) {
    throw new Error(`Failed loading trial reclaim candidates: ${reclaimRowsError.message}`);
  }

  let reclaimedUsers = 0;
  let reclaimedProfiles = 0;
  for (const row of (reclaimRows ?? []) as TrialLifecycleCleanupRow[]) {
    if (row.is_active || !isInactiveStatus(row.status)) {
      continue;
    }

    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, twilio_virtual_number')
      .eq('caretaker_id', row.user_id)
      .not('twilio_virtual_number', 'is', null);
    if (profileError) {
      throw new Error(`Failed loading profiles for reclaim user=${row.user_id}: ${profileError.message}`);
    }

    for (const profile of profiles ?? []) {
      if (!profile.twilio_virtual_number) {
        continue;
      }
      reclaimedProfiles += 1;
      if (!dryRun) {
        const released = await releaseNumberFromProfileWithOptions(profile.id, { markForRestore: true });
        if (!released) {
          logger.warn(`[trial] failed to reclaim number for profile=${profile.id}`);
        }
      }
    }

    reclaimedUsers += 1;
    if (!dryRun) {
      const { error: updateError } = await supabaseAdmin
        .from('user_subscriptions')
        .update({
          trial_reclaimed_at: nowIso,
          trial_purge_after_at: purgeAfterIso,
        })
        .eq('user_id', row.user_id);
      if (updateError) {
        throw new Error(`Failed updating trial reclaim markers for user=${row.user_id}: ${updateError.message}`);
      }
    }
  }

  const { data: purgeRows, error: purgeRowsError } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id, status, is_active')
    .not('trial_started_at', 'is', null)
    .is('trial_converted_at', null)
    .not('trial_reclaimed_at', 'is', null)
    .is('trial_purged_at', null)
    .not('trial_purge_after_at', 'is', null)
    .lte('trial_purge_after_at', nowIso);

  if (purgeRowsError) {
    throw new Error(`Failed loading trial purge candidates: ${purgeRowsError.message}`);
  }

  let purgeUsers = 0;
  let purgedCalls = 0;
  let purgedAlerts = 0;
  let purgedRecordings = 0;

  for (const row of (purgeRows ?? []) as TrialLifecycleCleanupRow[]) {
    if (row.is_active || !isInactiveStatus(row.status)) {
      continue;
    }

    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('caretaker_id', row.user_id);
    if (profileError) {
      throw new Error(`Failed loading profiles for purge user=${row.user_id}: ${profileError.message}`);
    }

    const profileIds = (profileRows ?? []).map((profile) => profile.id).filter(Boolean);
    if (!dryRun && profileIds.length > 0) {
      const { data: calls, error: callsError } = await supabaseAdmin
        .from('calls')
        .select('id, storage_path')
        .in('profile_id', profileIds);
      if (callsError) {
        throw new Error(`Failed loading trial calls for purge user=${row.user_id}: ${callsError.message}`);
      }

      const callIds = (calls ?? []).map((call) => call.id).filter(Boolean);
      const recordingPaths = (calls ?? []).map((call) => call.storage_path);

      purgedCalls += callIds.length;
      purgedRecordings += recordingPaths.filter((value) => typeof value === 'string' && value.trim().length > 0).length;
      purgedAlerts += await deleteAlertsByProfileIds(profileIds);

      if (recordingPaths.length > 0) {
        await deleteRecordingPaths(recordingPaths);
      }
      await deleteCallsByIds(callIds);
    } else if (profileIds.length > 0) {
      const { count: alertCount } = await supabaseAdmin
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .in('profile_id', profileIds);
      const { count: callCount } = await supabaseAdmin
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .in('profile_id', profileIds);
      purgedAlerts += alertCount ?? 0;
      purgedCalls += callCount ?? 0;
    }

    purgeUsers += 1;
    if (!dryRun) {
      const { error: markPurgedError } = await supabaseAdmin
        .from('user_subscriptions')
        .update({ trial_purged_at: nowIso })
        .eq('user_id', row.user_id);
      if (markPurgedError) {
        throw new Error(`Failed marking trial purge completion user=${row.user_id}: ${markPurgedError.message}`);
      }
    }
  }

  return {
    dryRun,
    reclaimedUsers,
    reclaimedProfiles,
    purgeUsers,
    purgedCalls,
    purgedAlerts,
    purgedRecordings,
  };
}

export function startTrialLifecycleCleanupScheduler() {
  const config = getTrialLifecycleCleanupConfig();
  if (!config.enabled) {
    return;
  }

  logger.info(
    `[trial] Lifecycle cleanup scheduler enabled (interval=${config.intervalMinutes}m, grace=${config.reclaimGraceHours}h, retention=${config.retentionDays}d, dryRun=${config.dryRun})`
  );

  const runCycle = async () => {
    try {
      const summary = await runTrialLifecycleCleanup({
        dryRun: config.dryRun,
        reclaimGraceHours: config.reclaimGraceHours,
        retentionDays: config.retentionDays,
      });
      logger.info(
        `[trial] cleanup complete dryRun=${summary.dryRun} reclaimedUsers=${summary.reclaimedUsers} reclaimedProfiles=${summary.reclaimedProfiles} purgeUsers=${summary.purgeUsers} purgedCalls=${summary.purgedCalls} purgedAlerts=${summary.purgedAlerts} purgedRecordings=${summary.purgedRecordings}`
      );
    } catch (error) {
      logger.err(error);
    }
  };

  setTimeout(() => {
    void runCycle();
  }, config.startupDelaySeconds * 1000);

  const interval = setInterval(() => {
    void runCycle();
  }, config.intervalMinutes * 60 * 1000);
  interval.unref?.();
}
