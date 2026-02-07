import supabaseAdmin from '@src/services/supabase';

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? '90');
const ALLOW_RETENTION_PRUNE = process.env.ALLOW_RETENTION_PRUNE === 'true';
const RECORDING_BUCKET = 'call-recordings';

function cutoffIso() {
  const now = Date.now();
  const cutoffMs = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return new Date(cutoffMs).toISOString();
}

async function pruneTable(table: string, column: string) {
  const cutoff = cutoffIso();
  const { error, data } = await supabaseAdmin
    .from(table)
    .delete()
    .lte(column, cutoff)
    .select('id');
  const count = data?.length ?? 0;
  if (error) {
    console.error(`[retention] Failed pruning ${table}:`, error.message);
    return 0;
  }
  console.log(`[retention] Pruned ${count ?? 0} rows from ${table} (<= ${cutoff}).`);
  return count ?? 0;
}

async function pruneRecordings() {
  const cutoff = cutoffIso();
  
  // Get all old calls with recordings from database
  const { data: oldCalls, error: queryError } = await supabaseAdmin
    .from('calls')
    .select('id, storage_path')
    .lte('created_at', cutoff)
    .not('storage_path', 'is', null);
  
  if (queryError) {
    console.error('[retention] Failed querying old recordings:', queryError.message);
    return 0;
  }
  
  if (!oldCalls || oldCalls.length === 0) {
    console.log('[retention] No old recordings to prune.');
    return 0;
  }
  
  let deletedCount = 0;
  
  // Delete files from Supabase storage
  for (const call of oldCalls) {
    if (!call.storage_path) continue;
    
    const { error: deleteError } = await supabaseAdmin
      .storage
      .from(RECORDING_BUCKET)
      .remove([call.storage_path]);
    
    if (deleteError) {
      console.warn(`[retention] Failed deleting file ${call.storage_path}:`, deleteError.message);
      continue;
    }
    
    deletedCount++;
  }
  
  console.log(`[retention] Pruned ${deletedCount} recording files from bucket.`);
  return deletedCount;
}

async function main() {
  if (!ALLOW_RETENTION_PRUNE) {
    console.log('[retention] ⚠️  Retention prune is DISABLED (ALLOW_RETENTION_PRUNE=false)');
    console.log('[retention] Set ALLOW_RETENTION_PRUNE=true to enable data pruning');
    process.exitCode = 0;
    return;
  }

  console.log(`[retention] Starting prune with window ${RETENTION_DAYS} days`);
  const totals: Record<string, number> = {};
  totals.alerts = await pruneTable('alerts', 'created_at');
  totals.calls = await pruneTable('calls', 'created_at');
  totals.recordings = await pruneRecordings();
  console.log('[retention] Completed prune summary:', totals);
}

main().catch((err) => {
  console.error('[retention] Unhandled error', err);
  process.exitCode = 1;
});
