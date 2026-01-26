import supabaseAdmin from '@src/services/supabase';
import { sendExpoPushNotifications, ExpoPushMessage } from './notifications';

const INVALID_EXPO_ERRORS = ['DeviceNotRegistered', 'PushSubscriptionExpired'];

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

export async function notifyProfileForAlert(profileId: string, payload: AlertPushPayload) {
  const { data: tokens } = await supabaseAdmin
    .from('profile_device_tokens')
    .select('id, expo_push_token')
    .eq('profile_id', profileId)
    .eq('is_active', true);

  if (!tokens || tokens.length === 0) {
    return;
  }

  const validTokens = tokens
    .map((tokenRow) => ({
      id: tokenRow.id,
      expo_push_token: tokenRow.expo_push_token,
    }))
    .filter((token): token is { id: string; expo_push_token: string } => Boolean(token.expo_push_token));

  const messages: ExpoPushMessage[] = validTokens.map((tokenRow) => ({
    to: tokenRow.expo_push_token,
    title: payload.title,
    body: payload.body,
    sound: 'default',
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
