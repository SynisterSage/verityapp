import supabaseAdmin from '@src/services/supabase';
import logger from 'jet-logger';
import { sendExpoPushNotifications, ExpoPushMessage } from './notifications';

const INVALID_EXPO_ERRORS = ['DeviceNotRegistered', 'PushSubscriptionExpired'];
const ACTIVITY_PUSH_SOUND = 'activity-notification.wav';
const ACTIVITY_PUSH_CHANNEL_ID = 'activity-alerts';
const SUPPORT_PUSH_SOUND = 'support-notification.wav';
const SUPPORT_PUSH_CHANNEL_ID = 'support-updates';
const CIRCLE_ALERT_TYPES = new Set<string>([
  'circle_invite',
  'pin_change',
  'safe_phrase_added',
  'trusted_contact_added',
  'blocked_caller_added',
  'security_password',
  'member_joined',
  'member_role_changed',
  'member_removed',
  'automation_settings_updated',
  'data_exported',
  'data_cleared',
]);

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

type SupportReplyPushPayload = {
  title: string;
  body: string;
  ticketId?: string;
  messageId?: string;
  data?: Record<string, string>;
};

type DeviceTokenRow = { id: string; user_id: string | null; expo_push_token: string };

type PushRecipient = {
  id: string;
  expo_push_token: string;
  notificationPreferences: Record<string, unknown> | null;
};

function readBooleanPref(value: unknown, key: string): boolean | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const enabled = (value as Record<string, unknown>)[key];
  return typeof enabled === 'boolean' ? enabled : null;
}

function normalizeAlertType(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function canReceivePushForAlertType(args: {
  alertType: string;
  profileDefaultPushEnabled: boolean;
  notificationPreferences?: Record<string, unknown> | null;
}) {
  const { alertType, profileDefaultPushEnabled, notificationPreferences } = args;

  const globalPushPref = readBooleanPref(notificationPreferences, 'enable_push_alerts');
  const globalPushEnabled =
    globalPushPref === null ? profileDefaultPushEnabled : globalPushPref;
  if (!globalPushEnabled) {
    return false;
  }

  if (alertType === 'trusted') {
    const trustedActivityPref = readBooleanPref(
      notificationPreferences,
      'enable_push_trusted_activity'
    );
    return trustedActivityPref === null ? true : trustedActivityPref;
  }

  if (CIRCLE_ALERT_TYPES.has(alertType)) {
    const circleActivityPref = readBooleanPref(
      notificationPreferences,
      'enable_push_circle_activity'
    );
    return circleActivityPref === null ? true : circleActivityPref;
  }

  return true;
}

function canReceivePushForSupportReply(args: {
  profileDefaultPushEnabled: boolean;
  notificationPreferences?: Record<string, unknown> | null;
}) {
  const { profileDefaultPushEnabled, notificationPreferences } = args;

  const globalPushPref = readBooleanPref(notificationPreferences, 'enable_push_alerts');
  const globalPushEnabled =
    globalPushPref === null ? profileDefaultPushEnabled : globalPushPref;
  if (!globalPushEnabled) {
    return false;
  }

  const supportReplyPref = readBooleanPref(
    notificationPreferences,
    'enable_push_support_replies'
  );
  return supportReplyPref === null ? true : supportReplyPref;
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

function normalizePushData(data?: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(data ?? {})
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );
}

async function deactivateInvalidTokens(
  recipients: Array<{ id: string; expo_push_token: string }>,
  messages: ExpoPushMessage[]
) {
  const responses = await sendExpoPushNotifications(messages);
  const tokensToDeactivate: string[] = [];

  responses.forEach((response, index) => {
    if (response.status === 'error' && shouldDeactivateToken(response.error)) {
      const tokenId = recipients[index]?.id;
      if (tokenId) {
        tokensToDeactivate.push(tokenId);
      }
    }
  });

  if (tokensToDeactivate.length > 0) {
    await supabaseAdmin
      .from('profile_device_tokens')
      .update({ is_active: false })
      .in('id', tokensToDeactivate);
  }
}

async function fetchPushRecipientsForProfile(profileId: string) {
  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('caretaker_id, enable_push_alerts')
    .eq('id', profileId)
    .maybeSingle();

  const defaultPushEnabled = profileRow?.enable_push_alerts !== false;

  const { data: tokensWithUser, error: tokensError } = await supabaseAdmin
    .from('profile_device_tokens')
    .select('id, user_id, expo_push_token')
    .eq('profile_id', profileId)
    .eq('is_active', true);

  if (tokensError && !isMissingUserIdColumnError(tokensError)) {
    logger.err(
      `[push-notify] failed loading tokens profile=${profileId} message=${tokensError.message}`
    );
    return { defaultPushEnabled, recipients: [] as PushRecipient[] };
  }

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
      return { defaultPushEnabled, recipients: [] as PushRecipient[] };
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
    return { defaultPushEnabled, recipients: [] as PushRecipient[] };
  }

  const memberUserIds = Array.from(
    new Set(
      tokens
        .map((tokenRow) => tokenRow.user_id)
        .filter((userId): userId is string => Boolean(userId))
    )
  );

  const memberNotificationPrefs = new Map<string, Record<string, unknown> | null>();
  if (memberUserIds.length > 0) {
    const { data: memberRows } = await supabaseAdmin
      .from('profile_members')
      .select('user_id, notification_preferences')
      .eq('profile_id', profileId)
      .in('user_id', memberUserIds);

    (memberRows ?? []).forEach((row) => {
      memberNotificationPrefs.set(
        row.user_id,
        row.notification_preferences as Record<string, unknown> | null
      );
    });
  }

  const recipients: PushRecipient[] = tokens
    .filter((token): token is DeviceTokenRow => Boolean(token.expo_push_token))
    .map((token) => ({
      id: token.id,
      expo_push_token: token.expo_push_token,
      notificationPreferences:
        token.user_id && memberNotificationPrefs.has(token.user_id)
          ? memberNotificationPrefs.get(token.user_id) ?? null
          : null,
    }));

  return { defaultPushEnabled, recipients };
}

export async function notifyProfileForAlert(profileId: string, payload: AlertPushPayload) {
  const { defaultPushEnabled, recipients } = await fetchPushRecipientsForProfile(profileId);
  const alertType = normalizeAlertType(payload.data?.alertType);

  const validRecipients = recipients.filter((recipient) =>
    canReceivePushForAlertType({
      alertType,
      profileDefaultPushEnabled: defaultPushEnabled,
      notificationPreferences: recipient.notificationPreferences,
    })
  );

  if (validRecipients.length === 0) {
    return;
  }

  const messages: ExpoPushMessage[] = validRecipients.map((recipient) => ({
    to: recipient.expo_push_token,
    title: payload.title,
    body: payload.body,
    sound: ACTIVITY_PUSH_SOUND,
    channelId: ACTIVITY_PUSH_CHANNEL_ID,
    data: {
      alertId: payload.alertId,
      ...(payload.callId ? { callId: payload.callId } : {}),
      ...normalizePushData(payload.data),
    },
  }));

  await deactivateInvalidTokens(validRecipients, messages);
}

export async function notifyProfileForSupportReply(
  profileId: string,
  payload: SupportReplyPushPayload
) {
  const { defaultPushEnabled, recipients } = await fetchPushRecipientsForProfile(profileId);

  const validRecipients = recipients.filter((recipient) =>
    canReceivePushForSupportReply({
      profileDefaultPushEnabled: defaultPushEnabled,
      notificationPreferences: recipient.notificationPreferences,
    })
  );

  if (validRecipients.length === 0) {
    return;
  }

  const messages: ExpoPushMessage[] = validRecipients.map((recipient) => ({
    to: recipient.expo_push_token,
    title: payload.title,
    body: payload.body,
    sound: SUPPORT_PUSH_SOUND,
    channelId: SUPPORT_PUSH_CHANNEL_ID,
    data: {
      routeTarget: 'support_portal',
      profileId,
      ...(payload.ticketId ? { supportTicketId: payload.ticketId } : {}),
      ...(payload.messageId ? { supportMessageId: payload.messageId } : {}),
      ...normalizePushData(payload.data),
    },
  }));

  await deactivateInvalidTokens(validRecipients, messages);
}
