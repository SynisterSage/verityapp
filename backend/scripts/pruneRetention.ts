import { getRetentionCleanupConfig, runRetentionCleanup } from '@src/services/retentionCleanup';

async function main() {
  const config = getRetentionCleanupConfig();

  if (!config.enabled) {
    console.log(
      '[retention] ⚠️  Retention cleanup is disabled. Set ENABLE_RETENTION_CLEANUP=true (or ALLOW_RETENTION_PRUNE=true).'
    );
    process.exitCode = 0;
    return;
  }

  console.log(
    `[retention] Starting manual cleanup (retentionDays=${config.retentionDays}, dryRun=${config.dryRun})`
  );

  const summary = await runRetentionCleanup({
    retentionDays: config.retentionDays,
    dryRun: config.dryRun,
  });

  console.log('[retention] Completed cleanup summary:', summary);
}

main().catch((err) => {
  console.error('[retention] Unhandled error', err);
  process.exitCode = 1;
});

