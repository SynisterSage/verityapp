import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

export type SentryEventLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export type SentryEventOptions = {
  level?: SentryEventLevel;
  screen?: string;
  userId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export function setUserContext(userId: string | null, email?: string | null) {
  if (!userId) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: userId, email: email ?? undefined });
}

export function clearUserContext() {
  Sentry.setUser(null);
}

export function logEvent(message: string, options: SentryEventOptions = {}) {
  const {
    level = 'info',
    screen,
    userId,
    tags = {},
    extra = {},
  } = options;

  Sentry.captureMessage(message, {
    level,
    tags: {
      platform: Platform.OS,
      screen: screen ?? 'unknown',
      ...tags,
    },
    extra: {
      userId,
      ...extra,
    },
  });
}

export function logError(error: unknown, options: SentryEventOptions = {}) {
  const {
    level = 'error',
    screen,
    userId,
    tags = {},
    extra = {},
  } = options;

  Sentry.captureException(error, {
    level,
    tags: {
      platform: Platform.OS,
      screen: screen ?? 'unknown',
      ...tags,
    },
    extra: {
      userId,
      ...extra,
    },
  });
}
