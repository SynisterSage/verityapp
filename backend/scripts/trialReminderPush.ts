import { getTrialReminderConfig, runTrialReminderPushCycle } from '@src/services/trialReminderPush';

async function main() {
  const config = getTrialReminderConfig();
  if (!config.enabled) {
    console.log(
      '[trial-reminder] Scheduler is disabled. Set ENABLE_TRIAL_REMINDER_PUSH=true to enable periodic reminders.'
    );
  }

  console.log(`[trial-reminder] Running manual cycle (dryRun=${config.dryRun})`);
  const summary = await runTrialReminderPushCycle({ dryRun: config.dryRun });
  console.log('[trial-reminder] Cycle summary:', summary);
}

main().catch((err) => {
  console.error('[trial-reminder] Unhandled error', err);
  process.exitCode = 1;
});
