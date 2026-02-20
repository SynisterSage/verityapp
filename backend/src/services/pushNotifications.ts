import supabaseAdmin from '@src/services/supabase';
import logger from 'jet-logger';
import { sendExpoPushNotifications, ExpoPushMessage } from './notifications';

const INVALID_EXPO_ERRORS = ['DeviceNotRegistered', 'PushSubscriptionExpired'];
const ACTIVITY_PUSH_SOUND = 'activity-notification.wav';
const ACTIVITY_PUSH_CHANNEL_ID = 'activity-alerts';

function shouldDeactivateToken(error: any) {
  if (!error) {
    return false;
  }
  const message = String(
    error?.details?.error ?? error?.message ?? error?.data?.details?.error
  );
  return INVALID_EXPO_ERRORS.some((keyword) =>
    message.toLowerCase().includes(keyword.toLowerCase())
  );
}

type AlertPushPayload = {
  alertId: string;
  callId?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

function readPushPref(value: unknown): boolean | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const enabled = (value as { enable_push_alerts?: unknown }).enable_push_alerts;
  return typeof enabled === 'boolean' ? enabled : null;
}

function isMissingUserIdColumnError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string } | null)?.message ??
      (error as { message?: string; details?: string } | null)?.details ??
      ''
  );
  return (
    message.includes("Could not find the 'user_id' column of 'profile_device_tokens'") ||
    message.includes('profile_device_tokens.user_id')
  );
}

export async function notifyProfileForAlert(profileId: string, payload: AlertPushPayload) {
  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id, enable_push_alerts')
    .eq('id', profileId)
    .maybeSingle();

  const defaultPushEnabled = profileRow?.enable_push_alerts !== false;
  const caretakerId = profileRow?.caretaker_id ?? null;

  const { data: tokensWithUser, error: tokensError } = await supabaseAdmin
    .from('profile_device_tokens')
    .select('id, user_id, expo_push_token')
    .eq('profile_id', profileId)
    .eq('is_active', true);

  if (tokensError && !isMissingUserIdColumnError(tokensError)) {
    logger.err(
      `[push-notify] failed loading tokens profile=${profileId} message=${tokensError.message}`
    );
    return;
  }

  type DeviceTokenRow = { id: string; user_id: string | null; expo_push_token: string };
  let tokens: DeviceTokenRow[] = [];

  if (tokensError && isMissingUserIdColumnError(tokensError)) {
    logger.warn(
      `[push-notify] profile_device_tokens.user_id missing for profile=${profileId}; falling back to legacy token query`
    );
    const { data: legacyTokens, error: legacyTokensError } = await supabaseAdmin
      .from('profile_device_tokens')
      .select('id, expo_push_token')
      .eq('profile_id', profileId)
      .eq('is_active', true);

    if (legacyTokensError) {
      logger.err(
        `[push-notify] failed loading legacy tokens profile=${profileId} message=${legacyTokensError.message}`
      );
      return;
    }

    tokens = (legacyTokens ?? []).map((row) => ({
      id: row.id,
      user_id: null,
      expo_push_token: row.expo_push_token,
    }));
  } else {
    tokens = (tokensWithUser ?? []).map((row) => ({
      id: row.id,
      user_id: row.user_id ?? null,
      expo_push_token: row.expo_push_token,
    }));
  }

  if (!tokens || tokens.length === 0) {
    return;
  }

  const memberUserIds = Array.from(
    new Set(
      tokens
        .map((tokenRow) => tokenRow.user_id)
        .filter((userId): userId is string => Boolean(userId))
    )
  );

  let memberPushPref = new Map<string, boolean>();
  if (memberUserIds.length > 0) {
    const { data: memberRows } = await supabaseAdmin
      .from('profile_members')
      .select('user_id, notification_preferences')
      .eq('profile_id', profileId)
      .in('user_id', memberUserIds);

    memberPushPref = new Map(
      (memberRows ?? [])
        .map((row) => {
          const enabled = readPushPref(row.notification_preferences);
          return enabled === null ? null : ([row.user_id, enabled] as const);
        })
        .filter((row): row is readonly [string, boolean] => Boolean(row))
    );
  }

  const validTokens = tokens
    .filter(
      (token): token is { id: string; user_id: string | null; expo_push_token: string } =>
        Boolean(token.expo_push_token)
    )
    .filter((token) => {
      if (!token.user_id) {
        return defaultPushEnabled;
      }
      if (memberPushPref.has(token.user_id)) {
        return memberPushPref.get(token.user_id) === true;
      }
      if (caretakerId && token.user_id === caretakerId) {
        return defaultPushEnabled;
      }
      return defaultPushEnabled;
    });

  if (validTokens.length === 0) {
    return;
  }

  const messages: ExpoPushMessage[] = validTokens.map((tokenRow) => ({
    to: tokenRow.expo_push_token,
    title: payload.title,
    body: payload.body,
    sound: ACTIVITY_PUSH_SOUND,
    channelId: ACTIVITY_PUSH_CHANNEL_ID,
    data: {
      alertId: payload.alertId,
      ...(payload.callId ? { callId: payload.callId } : {}),
      ...Object.fromEntries(
        Object.entries(payload.data ?? {}).filter(
          ([, value]) => value !== undefined && value !== null
        ).map(([key, value]) => [key, String(value)])
      ),
    },
  }));

  const responses = await sendExpoPushNotifications(messages);
  const tokensToDeactivate: string[] = [];

  responses.forEach((response, index) => {
    if (response.status === 'error' && shouldDeactivateToken(response.error)) {
      tokensToDeactivate.push(validTokens[index].id);
    }
  });

  if (tokensToDeactivate.length > 0) {
    await supabaseAdmin
      .from('profile_device_tokens')
      .update({ is_active: false })
      .in('id', tokensToDeactivate);
  }
}
