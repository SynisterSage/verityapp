import supabaseAdmin from '@src/services/supabase';

type Metadata = Record<string, unknown>;

export type TrialNudgeChannel = 'push' | 'in_app' | 'email';

export type ReserveTrialNudgeEventArgs = {
  userId: string;
  nudgeKey: string;
  channel: TrialNudgeChannel;
  profileId?: string | null;
  metadata?: Metadata;
};

export async function reserveTrialNudgeEvent(args: ReserveTrialNudgeEventArgs) {
  const { userId, nudgeKey, channel, metadata = {}, profileId } = args;
  const payload: Record<string, unknown> = {
    user_id: userId,
    nudge_key: nudgeKey,
    channel,
    metadata,
  };

  if (profileId) {
    payload.profile_id = profileId;
  }

  const { error } = await supabaseAdmin.from('trial_nudge_events').insert(payload);
  if (!error) {
    return true;
  }

  if (error.code === '23505') {
    return false;
  }

  throw new Error(`Failed to reserve trial nudge event: ${error.message}`);
}
