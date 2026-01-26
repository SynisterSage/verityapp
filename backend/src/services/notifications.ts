import fetch from 'node-fetch';
import logger from 'jet-logger';

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound?: 'default';
  data?: Record<string, string>;
};

const EXPO_PUSH_ENDPOINT =
  process.env.EXPO_PUSH_ENDPOINT ?? 'https://exp.host/--/api/v2/push/send';

type ExpoPushResponse = { status: 'ok'; data: any } | { status: 'error'; error: any };

export async function sendExpoPushNotifications(
  messages: ExpoPushMessage[]
): Promise<ExpoPushResponse[]> {
  if (messages.length === 0) {
    return [];
  }
  const responses: ExpoPushResponse[] = [];
  for (const message of messages) {
    try {
      const result = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      const payload = await result.json();
      if (!result.ok) {
        logger.err(new Error(`Expo push failed: ${JSON.stringify(payload)}`));
        responses.push({ status: 'error', error: payload });
        continue;
      }
      responses.push({ status: 'ok', data: payload });
    } catch (error) {
      logger.err(error as Error);
      responses.push({ status: 'error', error });
    }
  }
  return responses;
}

export type { ExpoPushMessage };
