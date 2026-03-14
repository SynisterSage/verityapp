import {
  getTrialLifecycleCleanupConfig,
  runTrialLifecycleCleanup,
} from '@src/services/trialLifecycleCleanup';

async function main() {
  const config = getTrialLifecycleCleanupConfig();

  if (!config.enabled) {
    console.log(
      '[trial] Lifecycle cleanup is disabled. Set ENABLE_TRIAL_LIFECYCLE_CLEANUP=true to enable scheduler/ops tooling.'
    );
  }

  console.log(
    `[trial] Starting manual cleanup (dryRun=${config.dryRun}, graceHours=${config.reclaimGraceHours}, retentionDays=${config.retentionDays})`
  );

  const summary = await runTrialLifecycleCleanup({
    dryRun: config.dryRun,
    reclaimGraceHours: config.reclaimGraceHours,
    retentionDays: config.retentionDays,
  });

  console.log('[trial] Completed cleanup summary:', summary);
}

main().catch((err) => {
  console.error('[trial] Unhandled error', err);
  process.exitCode = 1;
});
