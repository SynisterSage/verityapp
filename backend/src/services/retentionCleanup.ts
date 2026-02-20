import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import { deleteRecordingPaths } from '@src/services/callRecordingStorage';

const DAY_MS = 24 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 500;

export type RetentionCleanupConfig = {
  enabled: boolean;
  retentionDays: number;
  dryRun: boolean;
  intervalMinutes: number;
  startupDelaySeconds: number;
};

export type RetentionCleanupSummary = {
  dryRun: boolean;
  retentionDays: number;
  cutoffIso: string;
  alertsPruned: number;
  callsPruned: number;
  recordingsPruned: number;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function retentionEnabled() {
  return (
    process.env.ENABLE_RETENTION_CLEANUP === 'true' ||
    process.env.ALLOW_RETENTION_PRUNE === 'true'
  );
}

export function getRetentionCleanupConfig(): RetentionCleanupConfig {
  return {
    enabled: retentionEnabled(),
    retentionDays: parsePositiveInt(process.env.RETENTION_DAYS, 90),
    // Dry-run default is true for safety unless explicitly disabled.
    dryRun: process.env.RETENTION_CLEANUP_DRY_RUN !== 'false',
    intervalMinutes: parsePositiveInt(process.env.RETENTION_CLEANUP_INTERVAL_MINUTES, 360),
    startupDelaySeconds: parsePositiveInt(process.env.RETENTION_CLEANUP_STARTUP_DELAY_SECONDS, 45),
  };
}

function getCutoffIso(retentionDays: number) {
  return new Date(Date.now() - retentionDays * DAY_MS).toISOString();
}

async function countAlertsAtOrBefore(cutoffIso: string) {
  const { count, error } = await supabaseAdmin
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .lte('created_at', cutoffIso);
  if (error) {
    throw new Error(`Failed to count alerts for retention cleanup: ${error.message}`);
  }
  return count ?? 0;
}

async function deleteCallsByIds(callIds: string[]) {
  for (let i = 0; i < callIds.length; i += DELETE_BATCH_SIZE) {
    const batch = callIds.slice(i, i + DELETE_BATCH_SIZE);
    const { error } = await supabaseAdmin.from('calls').delete().in('id', batch);
    if (error) {
      throw new Error(`Failed deleting call batch for retention cleanup: ${error.message}`);
    }
  }
}

export async function runRetentionCleanup(
  partialConfig: Partial<Pick<RetentionCleanupConfig, 'retentionDays' | 'dryRun'>> = {}
): Promise<RetentionCleanupSummary> {
  const runtimeConfig = getRetentionCleanupConfig();
  const retentionDays = partialConfig.retentionDays ?? runtimeConfig.retentionDays;
  const dryRun = partialConfig.dryRun ?? runtimeConfig.dryRun;
  const cutoffIso = getCutoffIso(retentionDays);

  const { data: oldCalls, error: oldCallsError } = await supabaseAdmin
    .from('calls')
    .select('id, storage_path')
    .lte('created_at', cutoffIso);
  if (oldCallsError) {
    throw new Error(`Failed loading calls for retention cleanup: ${oldCallsError.message}`);
  }

  const callIds = (oldCalls ?? []).map((row) => row.id).filter(Boolean);
  const recordingPaths = (oldCalls ?? []).map((row) => row.storage_path);
  const callsPruned = callIds.length;
  const recordingsPruned = recordingPaths.filter((path) => typeof path === 'string' && path.trim()).length;

  const alertsPruned = await countAlertsAtOrBefore(cutoffIso);

  if (!dryRun) {
    if (recordingsPruned > 0) {
      await deleteRecordingPaths(recordingPaths);
    }
    if (callsPruned > 0) {
      await deleteCallsByIds(callIds);
    }
    if (alertsPruned > 0) {
      const { error: deleteAlertsError } = await supabaseAdmin
        .from('alerts')
        .delete()
        .lte('created_at', cutoffIso);
      if (deleteAlertsError) {
        throw new Error(`Failed deleting alerts for retention cleanup: ${deleteAlertsError.message}`);
      }
    }
  }

  return {
    dryRun,
    retentionDays,
    cutoffIso,
    alertsPruned,
    callsPruned,
    recordingsPruned,
  };
}

export function startRetentionCleanupScheduler() {
  const config = getRetentionCleanupConfig();
  if (!config.enabled) {
    return;
  }

  logger.info(
    `[retention] Scheduler enabled (interval=${config.intervalMinutes}m, dryRun=${config.dryRun}, retentionDays=${config.retentionDays})`
  );

  const runCycle = async () => {
    try {
      const summary = await runRetentionCleanup({
        retentionDays: config.retentionDays,
        dryRun: config.dryRun,
      });
      logger.info(
        `[retention] Cleanup complete dryRun=${summary.dryRun} cutoff=${summary.cutoffIso} alerts=${summary.alertsPruned} calls=${summary.callsPruned} recordings=${summary.recordingsPruned}`
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

