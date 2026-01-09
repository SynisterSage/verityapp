import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';

export async function removeTrustedContact(profileId: string, callerHash: string | null) {
  if (!callerHash) return;
  const { error } = await supabaseAdmin
    .from('trusted_contacts')
    .delete()
    .eq('profile_id', profileId)
    .eq('caller_hash', callerHash);
  if (error) {
    logger.err(`Failed to remove trusted contact on block: ${error.message}`);
  }
}

export async function removeBlockedEntry(profileId: string, callerHash: string | null) {
  if (!callerHash) return;
  const { error } = await supabaseAdmin
    .from('blocked_callers')
    .delete()
    .eq('profile_id', profileId)
    .eq('caller_hash', callerHash);
  if (error) {
    logger.err(`Failed to remove blocked caller on trust: ${error.message}`);
  }
}
