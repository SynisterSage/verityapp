import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import { notifyUserForTrialReminder } from '@src/services/pushNotifications';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const INACTIVE_STATUSES = new Set(['inactive', 'expired', 'cancelled']);

type TrialReminderConfig = {
  enabled: boolean;
  dryRun: boolean;
  intervalMinutes: number;
  startupDelaySeconds: number;
};

type TrialSubscriptionRow = {
  user_id: string;
  status: string;
  is_active: boolean;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_converted_at: string | null;
  trial_reclaimed_at: string | null;
  trial_purged_at: string | null;
};

type TrialNudge = {
  nudgeKey: string;
  title: string;
  body: string;
};

export type TrialReminderSummary = {
  dryRun: boolean;
  candidates: number;
  nudgesSelected: number;
  nudgesSkippedAlreadySent: number;
  nudgesSent: number;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function parseIso(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return timestamp;
}

function remindersEnabled() {
  return process.env.ENABLE_TRIAL_REMINDER_PUSH === 'true';
}

function isInactiveStatus(value: string | null | undefined) {
  return INACTIVE_STATUSES.has((value ?? '').trim().toLowerCase());
}

export function getTrialReminderConfig(): TrialReminderConfig {
  return {
    enabled: remindersEnabled(),
    dryRun: process.env.TRIAL_REMINDER_PUSH_DRY_RUN !== 'false',
    intervalMinutes: parsePositiveInt(process.env.TRIAL_REMINDER_PUSH_INTERVAL_MINUTES, 120),
    startupDelaySeconds: parsePositiveInt(process.env.TRIAL_REMINDER_PUSH_STARTUP_DELAY_SECONDS, 120),
  };
}

function buildTrialNudge(row: TrialSubscriptionRow, nowMs: number): TrialNudge | null {
  if (row.trial_converted_at || row.trial_reclaimed_at || row.trial_purged_at) {
    return null;
  }

  const trialEndsAtMs = parseIso(row.trial_ends_at);
  if (!trialEndsAtMs) {
    return null;
  }

  const statusIsInactive = !row.is_active || isInactiveStatus(row.status);
  const msUntilTrialEnd = trialEndsAtMs - nowMs;
  const msSinceTrialEnd = nowMs - trialEndsAtMs;

  if (statusIsInactive) {
    if (msSinceTrialEnd >= 0 && msSinceTrialEnd <= 2 * DAY_MS) {
      return {
        nudgeKey: 'trial_expired_resume',
        title: 'Your trial ended - keep call protection on',
        body: 'Resume membership to keep your verified number and call screening active.',
      };
    }
    return null;
  }

  if (msUntilTrialEnd <= 0) {
    return {
      nudgeKey: 'trial_ends_today',
      title: 'Trial ending today',
      body: 'Keep your protection running without interruption by confirming membership.',
    };
  }

  if (msUntilTrialEnd <= DAY_MS) {
    return {
      nudgeKey: 'trial_1_day_left',
      title: '1 day left in your trial',
      body: 'Your call protection is active now. Keep it on with your monthly plan.',
    };
  }

  if (msUntilTrialEnd <= 2 * DAY_MS) {
    return {
      nudgeKey: 'trial_2_days_left',
      title: '2 days left in your trial',
      body: 'You are almost at the end of your trial. Keep your protection and number active.',
    };
  }

  if (msUntilTrialEnd <= 5 * DAY_MS && msUntilTrialEnd > 4 * DAY_MS) {
    return {
      nudgeKey: 'trial_value_day2',
      title: 'How is your trial going?',
      body: 'Calls are being screened in real time. Keep everything active after trial with monthly billing.',
    };
  }

  return null;
}

async function reserveNudgeEvent(args: {
  userId: string;
  nudgeKey: string;
  metadata: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from('trial_nudge_events').insert({
    user_id: args.userId,
    nudge_key: args.nudgeKey,
    channel: 'push',
    metadata: args.metadata,
  });

  if (!error) {
    return true;
  }

  if (error.code === '23505') {
    return false;
  }

  throw new Error(`Failed to reserve trial nudge event: ${error.message}`);
}

export async function runTrialReminderPushCycle(
  partialConfig: Partial<Pick<TrialReminderConfig, 'dryRun'>> = {}
): Promise<TrialReminderSummary> {
  const config = getTrialReminderConfig();
  const dryRun = partialConfig.dryRun ?? config.dryRun;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const { data, error } = await supabaseAdmin
    .from('user_subscriptions')
    .select(
      'user_id, status, is_active, trial_started_at, trial_ends_at, trial_converted_at, trial_reclaimed_at, trial_purged_at'
    )
    .not('trial_started_at', 'is', null)
    .not('trial_ends_at', 'is', null);

  if (error) {
    throw new Error(`Failed loading trial reminder candidates: ${error.message}`);
  }

  const rows = (data ?? []) as TrialSubscriptionRow[];
  let nudgesSelected = 0;
  let nudgesSkippedAlreadySent = 0;
  let nudgesSent = 0;

  for (const row of rows) {
    const nudge = buildTrialNudge(row, nowMs);
    if (!nudge) {
      continue;
    }
    nudgesSelected += 1;

    if (dryRun) {
      logger.info(`[trial-reminder] dry-run user=${row.user_id} nudge=${nudge.nudgeKey}`);
      continue;
    }

    const reserved = await reserveNudgeEvent({
      userId: row.user_id,
      nudgeKey: nudge.nudgeKey,
      metadata: {
        status: row.status,
        isActive: row.is_active,
        trialEndsAt: row.trial_ends_at,
        generatedAt: nowIso,
      },
    });
    if (!reserved) {
      nudgesSkippedAlreadySent += 1;
      continue;
    }

    await notifyUserForTrialReminder(row.user_id, {
      nudgeKey: nudge.nudgeKey,
      title: nudge.title,
      body: nudge.body,
      data: {
        trialEndsAt: row.trial_ends_at ?? '',
      },
    });
    nudgesSent += 1;
  }

  return {
    dryRun,
    candidates: rows.length,
    nudgesSelected,
    nudgesSkippedAlreadySent,
    nudgesSent,
  };
}

export function startTrialReminderPushScheduler() {
  const config = getTrialReminderConfig();
  if (!config.enabled) {
    return;
  }

  logger.info(
    `[trial-reminder] Scheduler enabled (interval=${config.intervalMinutes}m, dryRun=${config.dryRun})`
  );

  const runCycle = async () => {
    try {
      const summary = await runTrialReminderPushCycle({ dryRun: config.dryRun });
      logger.info(
        `[trial-reminder] cycle complete dryRun=${summary.dryRun} candidates=${summary.candidates} selected=${summary.nudgesSelected} skippedAlreadySent=${summary.nudgesSkippedAlreadySent} sent=${summary.nudgesSent}`
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
