import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';

const RECORDINGS_BUCKET = 'call-recordings';
const REMOVE_BATCH_SIZE = 100;
const LIST_BATCH_SIZE = 100;

function normalizePaths(paths: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const path of paths) {
    if (!path || typeof path !== 'string') {
      continue;
    }
    const trimmed = path.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

async function listProfileRecordingPaths(profileId: string) {
  const prefix = `profiles/${profileId}/calls`;
  const collected: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin.storage
      .from(RECORDINGS_BUCKET)
      .list(prefix, {
        limit: LIST_BATCH_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      logger.err(
        `Failed to list recording paths for profile ${profileId}: ${error.message}`
      );
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    data.forEach((entry) => {
      if (entry?.name) {
        collected.push(`${prefix}/${entry.name}`);
      }
    });

    if (data.length < LIST_BATCH_SIZE) {
      break;
    }
    offset += LIST_BATCH_SIZE;
  }

  return collected;
}

export async function deleteRecordingPaths(paths: Array<string | null | undefined>) {
  const normalized = normalizePaths(paths);
  if (normalized.length === 0) {
    return;
  }

  for (let i = 0; i < normalized.length; i += REMOVE_BATCH_SIZE) {
    const batch = normalized.slice(i, i + REMOVE_BATCH_SIZE);
    const { error } = await supabaseAdmin.storage.from(RECORDINGS_BUCKET).remove(batch);
    if (error) {
      logger.err(`Failed to delete recordings batch: ${error.message}`);
    }
  }
}

export async function deleteProfileRecordingPaths(
  profileId: string,
  knownPaths: Array<string | null | undefined> = []
) {
  const listedPaths = await listProfileRecordingPaths(profileId);
  await deleteRecordingPaths([...knownPaths, ...listedPaths]);
}
