export type SentryEventLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export type SentryEventOptions = {
  level?: SentryEventLevel;
  screen?: string;
  userId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export function setUserContext(_userId: string | null, _email?: string | null) {
  // Sentry disabled.
}

export function clearUserContext() {
  // Sentry disabled.
}

export function logEvent(_message: string, _options: SentryEventOptions = {}) {
  // Sentry disabled.
}

export function logError(_error: unknown, _options: SentryEventOptions = {}) {
  // Sentry disabled.
}
