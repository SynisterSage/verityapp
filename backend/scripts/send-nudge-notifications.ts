import apn from 'apn';
import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';

type ProfileRow = {
  id: string;
  caretaker_id: string;
  created_at: string;
  completed_test_call: boolean | null;
  completed_alert_prefs: boolean | null;
  completed_safe_phrases: boolean | null;
  dismissed_nudge_cards?: string[] | null;
  pin_hash: string | null;
  passcode_hash: string | null;
  timezone?: string | null;
};

type ProfileMemberRow = {
  user_id: string;
  role?: 'admin' | 'editor' | null;
  is_caretaker?: boolean | null;
};

type DeviceTokenRow = {
  id: string;
  profile_id: string;
  user_id?: string | null;
  expo_push_token: string;
  is_active?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

type NudgeKind = 'test_call' | 'alert_prefs' | 'safe_phrases';

type NudgeCopy = {
  kind: NudgeKind;
  title: string;
  body: string;
  deepLink: string;
  routeTarget: 'nudge_test_call' | 'nudge_alert_prefs' | 'nudge_safe_phrases';
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const QUIET_HOUR_START = 8;
const QUIET_HOUR_END = 21;
const DEFAULT_TIMEZONE = 'America/New_York';

const NUDGES: Record<NudgeKind, NudgeCopy> = {
  test_call: {
    kind: 'test_call',
    title: 'Verify Verity is working',
    body: 'Run a quick test call to make sure calls are being screened correctly.',
    deepLink: 'verityprotect://nudge/test_call',
    routeTarget: 'nudge_test_call',
  },
  alert_prefs: {
    kind: 'alert_prefs',
    title: 'How do you want to be notified?',
    body: 'Set up your alert preferences so you never miss a blocked call.',
    deepLink: 'verityprotect://nudge/alert_prefs',
    routeTarget: 'nudge_alert_prefs',
  },
  safe_phrases: {
    kind: 'safe_phrases',
    title: 'Make Verity smarter',
    body: 'Add safe phrases so Verity knows exactly what to listen for.',
    deepLink: 'verityprotect://nudge/safe_phrases',
    routeTarget: 'nudge_safe_phrases',
  },
};

const APN_KEY = process.env.APN_KEY ?? process.env.APNS_AUTH_KEY ?? '';
const APN_KEY_ID = process.env.APN_KEY_ID ?? process.env.APNS_AUTH_KEY_ID ?? '';
const APN_TEAM_ID = process.env.APN_TEAM_ID ?? process.env.APNS_TEAM_ID ?? '';
const APN_BUNDLE_ID =
  process.env.APN_BUNDLE_ID ?? process.env.APPLE_APP_STORE_BUNDLE_ID ?? '';
const APN_PRODUCTION =
  (process.env.APN_PRODUCTION ?? process.env.APNS_PRODUCTION ?? 'true') !== 'false';

if (!APN_KEY || !APN_KEY_ID || !APN_TEAM_ID || !APN_BUNDLE_ID) {
  throw new Error('Missing APN_KEY, APN_KEY_ID, APN_TEAM_ID, or APN_BUNDLE_ID');
}

const apnProvider = new apn.Provider({
  token: {
    key: APN_KEY.includes('\\n') ? APN_KEY.replace(/\\n/g, '\n') : APN_KEY,
    keyId: APN_KEY_ID,
    teamId: APN_TEAM_ID,
  },
  production: APN_PRODUCTION,
});

function determineNudge(profile: ProfileRow): NudgeCopy | null {
  const dismissed = new Set(
    (profile.dismissed_nudge_cards ?? [])
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0)
      .map((value) => value.replace(/^onboarding_/, ''))
  );

  if (profile.completed_test_call !== true && !dismissed.has('test_call')) {
    return NUDGES.test_call;
  }
  if (profile.completed_alert_prefs !== true && !dismissed.has('alert_prefs')) {
    return NUDGES.alert_prefs;
  }
  if (profile.completed_safe_phrases !== true && !dismissed.has('safe_phrases')) {
    return NUDGES.safe_phrases;
  }
  return null;
}

function resolveTimezone(profile: ProfileRow) {
  const tz = (profile.timezone ?? '').trim();
  return tz || DEFAULT_TIMEZONE;
}

function localHourForTimezone(timeZone: string, now: Date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone,
    }).formatToParts(now);
    const hourPart = parts.find((part) => part.type === 'hour')?.value ?? '';
    const hour = Number(hourPart);
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return null;
  }
}

function isQuietHours(timeZone: string, now: Date) {
  const hour = localHourForTimezone(timeZone, now);
  if (hour === null) {
    return true;
  }
  return hour < QUIET_HOUR_START || hour >= QUIET_HOUR_END;
}

function looksLikeApnToken(raw: string) {
  const normalized = raw.replace(/[<>\s]/g, '').trim();
  return /^[a-fA-F0-9]{64,200}$/.test(normalized);
}

function extractApnToken(row: DeviceTokenRow) {
  const metadataTokenCandidates = [
    row.metadata?.apns_device_token,
    row.metadata?.apn_device_token,
    row.metadata?.device_push_token,
  ];
  for (const candidate of metadataTokenCandidates) {
    if (typeof candidate === 'string' && looksLikeApnToken(candidate)) {
      return candidate.replace(/[<>\s]/g, '');
    }
  }
  if (looksLikeApnToken(row.expo_push_token)) {
    return row.expo_push_token.replace(/[<>\s]/g, '');
  }
  return null;
}

function isMissingTableError(error: unknown) {
  const text = String(
    (error as { message?: string; details?: string } | null)?.message ??
      (error as { message?: string; details?: string } | null)?.details ??
      ''
  ).toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('could not find the table') ||
    text.includes('pgrst205')
  );
}

function isMissingColumnError(error: unknown, column: string) {
  const text = String(
    (error as { message?: string; details?: string } | null)?.message ??
      (error as { message?: string; details?: string } | null)?.details ??
      ''
  ).toLowerCase();
  return text.includes(column.toLowerCase()) && text.includes('column');
}

async function tableExists(tableName: string) {
  const { error } = await supabaseAdmin.from(tableName).select('*').limit(1);
  if (!error) {
    return true;
  }
  if (isMissingTableError(error)) {
    return false;
  }
  logger.warn(`[nudge] Unable to verify table ${tableName}: ${error.message}`);
  return false;
}

async function hasLoggedNudge(
  pushLogEnabled: boolean,
  userId: string,
  profileId: string,
  nudgeKey: NudgeKind
) {
  if (!pushLogEnabled) {
    return false;
  }
  const { data, error } = await supabaseAdmin
    .from('push_notifications_log')
    .select('id')
    .eq('user_id', userId)
    .eq('profile_id', profileId)
    .eq('nudge_key', nudgeKey)
    .limit(1);
  if (error) {
    logger.warn(
      `[nudge] push_notifications_log lookup failed user=${userId} profile=${profileId}: ${error.message}`
    );
    return false;
  }
  return (data ?? []).length > 0;
}

async function reserveNudgeSlot(userId: string, profileId: string, nudgeKey: NudgeKind) {
  const payload = {
    user_id: userId,
    profile_id: profileId,
    nudge_key: `onboarding_${nudgeKey}`,
    channel: 'push',
    metadata: {
      source: 'github_actions',
      workflow: 'nudge-notifications',
    },
  };
  const { error } = await supabaseAdmin.from('trial_nudge_events').insert(payload);
  if (!error) {
    return true;
  }
  if (String(error.message).toLowerCase().includes('duplicate key value')) {
    return false;
  }
  logger.warn(
    `[nudge] trial_nudge_events reserve failed user=${userId} profile=${profileId} key=${nudgeKey}: ${error.message}`
  );
  return false;
}

async function deactivateInvalidToken(tokenId: string) {
  const { error } = await supabaseAdmin
    .from('profile_device_tokens')
    .update({ is_active: false })
    .eq('id', tokenId);
  if (error) {
    logger.warn(`[nudge] failed to deactivate invalid token row=${tokenId}: ${error.message}`);
  } else {
    logger.info(`[nudge] deactivated invalid token row=${tokenId}`);
  }
}

async function loadCandidateProfiles(now: Date) {
  const olderThan24h = new Date(now.getTime() - ONE_DAY_MS).toISOString();
  const newerThan7d = new Date(now.getTime() - 7 * ONE_DAY_MS).toISOString();

  const baseSelect =
    'id, caretaker_id, created_at, completed_test_call, completed_alert_prefs, completed_safe_phrases, pin_hash, passcode_hash';
  const withOptionalColumns = await supabaseAdmin
    .from('profiles')
    .select(`${baseSelect}, timezone, dismissed_nudge_cards`)
    .lte('created_at', olderThan24h)
    .gte('created_at', newerThan7d);

  let data: ProfileRow[] | null = withOptionalColumns.data as ProfileRow[] | null;
  let error = withOptionalColumns.error;

  if (
    error &&
    (isMissingColumnError(error, 'timezone') || isMissingColumnError(error, 'dismissed_nudge_cards'))
  ) {
    const withoutOptionalColumns = await supabaseAdmin
      .from('profiles')
      .select(baseSelect)
      .lte('created_at', olderThan24h)
      .gte('created_at', newerThan7d);
    data = withoutOptionalColumns.data as ProfileRow[] | null;
    error = withoutOptionalColumns.error;
  }

  if (error) {
    throw new Error(`Failed loading candidate profiles: ${error.message}`);
  }

  const rows = (data ?? []) as ProfileRow[];
  return rows.filter((row) => {
    const onboardingComplete = Boolean(row.pin_hash ?? row.passcode_hash);
    const hasIncompleteSetup =
      row.completed_test_call !== true ||
      row.completed_alert_prefs !== true ||
      row.completed_safe_phrases !== true;
    return onboardingComplete && hasIncompleteSetup;
  });
}

async function loadCircleUserIds(profile: ProfileRow) {
  const { data, error } = await supabaseAdmin
    .from('profile_members')
    .select('user_id, role, is_caretaker')
    .eq('profile_id', profile.id);
  if (error) {
    logger.warn(`[nudge] failed loading profile members profile=${profile.id}: ${error.message}`);
    return new Set<string>([profile.caretaker_id]);
  }
  const memberIds = (data ?? [])
    .map((row) => row as ProfileMemberRow)
    .filter((row) => row.is_caretaker === true || row.role === 'admin')
    .map((row) => row.user_id);
  return new Set<string>([profile.caretaker_id, ...memberIds]);
}

async function loadTokens(profileId: string, circleUserIds: Set<string>) {
  let query = supabaseAdmin
    .from('profile_device_tokens')
    .select('id, profile_id, user_id, expo_push_token, is_active, metadata')
    .eq('profile_id', profileId)
    .eq('is_active', true);

  if (circleUserIds.size > 0) {
    query = query.in('user_id', Array.from(circleUserIds));
  }

  const { data, error } = await query;
  if (!error) {
    return (data ?? []) as DeviceTokenRow[];
  }

  const message = String(error.message ?? '').toLowerCase();
  if (message.includes("could not find the 'user_id' column")) {
    const fallback = await supabaseAdmin
      .from('profile_device_tokens')
      .select('id, profile_id, expo_push_token, is_active, metadata')
      .eq('profile_id', profileId)
      .eq('is_active', true);
    if (fallback.error) {
      logger.warn(
        `[nudge] failed loading fallback tokens profile=${profileId}: ${fallback.error.message}`
      );
      return [];
    }
    return (fallback.data ?? []) as DeviceTokenRow[];
  }

  logger.warn(`[nudge] failed loading tokens profile=${profileId}: ${error.message}`);
  return [];
}

function buildApnNotification(copy: NudgeCopy) {
  const notification = new apn.Notification();
  notification.topic = APN_BUNDLE_ID;
  notification.priority = 10;
  notification.sound = 'default';
  notification.badge = 1;
  notification.alert = {
    title: copy.title,
    body: copy.body,
  };
  notification.payload = {
    deep_link: copy.deepLink,
    route_target: copy.routeTarget,
    routeTarget: copy.routeTarget,
  };
  notification.expiry = Math.floor(Date.now() / 1000) + 60 * 60;
  return notification;
}

async function main() {
  const now = new Date();
  const pushLogEnabled = await tableExists('push_notifications_log');
  const profiles = await loadCandidateProfiles(now);
  logger.info(`[nudge] loaded candidates=${profiles.length} pushLogEnabled=${pushLogEnabled}`);

  const nudgedPrimaryUsers = new Set<string>();
  const sentTokenDedup = new Set<string>();

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const profile of profiles) {
    const primaryUserId = profile.caretaker_id;
    const nudge = determineNudge(profile);
    if (!nudge) {
      skippedCount += 1;
      logger.info(`[nudge] skip profile=${profile.id} reason=no_pending_steps_or_dismissed`);
      continue;
    }

    if (nudgedPrimaryUsers.has(primaryUserId)) {
      skippedCount += 1;
      logger.info(
        `[nudge] skip profile=${profile.id} user=${primaryUserId} reason=primary_user_already_nudged`
      );
      continue;
    }

    const timeZone = resolveTimezone(profile);
    if (isQuietHours(timeZone, now)) {
      skippedCount += 1;
      logger.info(
        `[nudge] skip profile=${profile.id} user=${primaryUserId} reason=quiet_hours timezone=${timeZone}`
      );
      continue;
    }

    const alreadyLogged = await hasLoggedNudge(pushLogEnabled, primaryUserId, profile.id, nudge.kind);
    if (alreadyLogged) {
      skippedCount += 1;
      logger.info(
        `[nudge] skip profile=${profile.id} user=${primaryUserId} reason=already_logged key=${nudge.kind}`
      );
      continue;
    }

    const reserved = await reserveNudgeSlot(primaryUserId, profile.id, nudge.kind);
    if (!reserved) {
      skippedCount += 1;
      logger.info(
        `[nudge] skip profile=${profile.id} user=${primaryUserId} reason=already_sent key=${nudge.kind}`
      );
      continue;
    }

    const circleUserIds = await loadCircleUserIds(profile);
    const tokenRows = await loadTokens(profile.id, circleUserIds);
    if (tokenRows.length === 0) {
      skippedCount += 1;
      logger.info(
        `[nudge] skip profile=${profile.id} user=${primaryUserId} reason=no_active_tokens`
      );
      continue;
    }

    const notification = buildApnNotification(nudge);
    let sentForProfile = 0;

    for (const row of tokenRows) {
      const apnToken = extractApnToken(row);
      if (!apnToken) {
        skippedCount += 1;
        logger.info(
          `[nudge] skip token row=${row.id} profile=${profile.id} reason=not_apn_token`
        );
        continue;
      }

      if (sentTokenDedup.has(apnToken)) {
        skippedCount += 1;
        logger.info(
          `[nudge] skip token row=${row.id} profile=${profile.id} reason=token_already_processed`
        );
        continue;
      }
      sentTokenDedup.add(apnToken);

      try {
        const result = await apnProvider.send(notification, apnToken);
        const failed = result.failed?.[0];
        if (failed) {
          failedCount += 1;
          const status = Number((failed.response as { status?: number } | undefined)?.status ?? 0);
          const reason = String(
            (failed.response as { reason?: string } | undefined)?.reason ??
              (failed.error as { message?: string } | undefined)?.message ??
              'unknown'
          );
          logger.warn(
            `[nudge] send failed profile=${profile.id} tokenRow=${row.id} status=${status} reason=${reason}`
          );
          if (status === 410 || reason.toLowerCase().includes('unregistered')) {
            await deactivateInvalidToken(row.id);
          }
          continue;
        }

        sentCount += 1;
        sentForProfile += 1;
        logger.info(
          `[nudge] sent profile=${profile.id} tokenRow=${row.id} user=${primaryUserId} key=${nudge.kind}`
        );
      } catch (error) {
        failedCount += 1;
        logger.warn(
          `[nudge] send threw profile=${profile.id} tokenRow=${row.id} message=${String(error)}`
        );
      }
    }

    if (sentForProfile > 0) {
      nudgedPrimaryUsers.add(primaryUserId);
    }
  }

  logger.info(
    `[nudge] completed sent=${sentCount} skipped=${skippedCount} failed=${failedCount} nudgedPrimaryUsers=${nudgedPrimaryUsers.size}`
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      logger.err(error as Error);
      process.exitCode = 1;
    })
    .finally(() => {
      apnProvider.shutdown();
    });
}
