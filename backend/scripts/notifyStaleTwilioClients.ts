import 'dotenv/config';

import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import { notifyProfileForAlert } from '@src/services/pushNotifications';

type ProfileStaleRow = {
  id: string;
  enable_push_alerts: boolean | null;
  twilio_client_last_seen_at: string | null;
  twilio_client_stale_notified_at: string | null;
};

const CLIENT_SESSION_TTL_SECONDS = Number(process.env.TWILIO_CLIENT_SESSION_TTL ?? '3600');
const STALE_NOTIFY_COOLDOWN_SECONDS = Number(
  process.env.TWILIO_CLIENT_STALE_NOTIFY_COOLDOWN_SECONDS ?? '86400'
);

function toIsoBefore(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function shouldNotify(row: ProfileStaleRow, cooldownCutoffIso: string) {
  if (row.enable_push_alerts === false) {
    return false;
  }
  if (!row.twilio_client_last_seen_at) {
    return false;
  }
  if (!row.twilio_client_stale_notified_at) {
    return true;
  }
  return row.twilio_client_stale_notified_at <= cooldownCutoffIso;
}

async function main() {
  const staleCutoffIso = toIsoBefore(CLIENT_SESSION_TTL_SECONDS);
  const cooldownCutoffIso = toIsoBefore(STALE_NOTIFY_COOLDOWN_SECONDS);

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, enable_push_alerts, twilio_client_last_seen_at, twilio_client_stale_notified_at')
    .not('twilio_client_last_seen_at', 'is', null)
    .lte('twilio_client_last_seen_at', staleCutoffIso);

  if (error) {
    logger.err(error);
    process.exitCode = 1;
    return;
  }

  const staleProfiles = (data ?? []) as ProfileStaleRow[];
  const targets = staleProfiles.filter((row) => shouldNotify(row, cooldownCutoffIso));
  if (targets.length === 0) {
    logger.info('[twilio-client-stale] no stale profiles to notify');
    return;
  }

  const nowIso = new Date().toISOString();
  const notifiedProfileIds: string[] = [];

  for (const profile of targets) {
    try {
      await notifyProfileForAlert(profile.id, {
        alertId: `twilio-stale-${profile.id}-${Date.now()}`,
        title: 'Open Verity to stay reachable',
        body: 'Open Verity Protect so protected calls can reach you in-app.',
        data: {
          alertType: 'twilio_client_stale',
          routeTarget: 'calls_trusted',
        },
      });
      notifiedProfileIds.push(profile.id);
      logger.info(`[twilio-client-stale] notified profile=${profile.id}`);
    } catch (notifyError) {
      logger.err(notifyError as Error);
      logger.warn(`[twilio-client-stale] failed profile=${profile.id}`);
    }
  }

  if (notifiedProfileIds.length > 0) {
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ twilio_client_stale_notified_at: nowIso })
      .in('id', notifiedProfileIds);
    if (updateError) {
      logger.err(updateError);
      process.exitCode = 1;
      return;
    }
  }

  logger.info(
    `[twilio-client-stale] completed stale=${staleProfiles.length} eligible=${targets.length} notified=${notifiedProfileIds.length}`
  );
}

main().catch((error) => {
  logger.err(error as Error);
  process.exitCode = 1;
});

