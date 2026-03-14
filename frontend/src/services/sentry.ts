import { getPostHogClient } from './posthog';
import type { JsonType, PostHogEventProperties } from '@posthog/core';

export type SentryEventLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export type SentryEventOptions = {
  level?: SentryEventLevel;
  screen?: string;
  userId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

function toJsonType(value: unknown): JsonType {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonType(item));
  }
  if (value && typeof value === 'object') {
    const next: Record<string, JsonType> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      next[key] = toJsonType(nestedValue);
    }
    return next;
  }
  return String(value);
}

function buildEventProperties(options: SentryEventOptions = {}) {
  const properties: PostHogEventProperties = {};
  if (options.level) {
    properties.level = toJsonType(options.level);
  }
  if (options.screen) {
    properties.screen = toJsonType(options.screen);
  }
  if (options.userId) {
    properties.user_id = toJsonType(options.userId);
  }
  for (const [key, value] of Object.entries(options.tags ?? {})) {
    properties[`tag_${key}`] = toJsonType(value);
  }
  for (const [key, value] of Object.entries(options.extra ?? {})) {
    if (value !== undefined) {
      properties[key] = toJsonType(value);
    }
  }
  return properties;
}

function toErrorObject(error: unknown) {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  return new Error('Unknown error');
}

export function setUserContext(userId: string | null, email?: string | null) {
  const posthog = getPostHogClient();
  if (!posthog) {
    return;
  }
  if (!userId) {
    posthog.reset();
    return;
  }
  const properties: PostHogEventProperties = {};
  if (email) {
    properties.email = toJsonType(email);
  }
  posthog.identify(userId, Object.keys(properties).length > 0 ? properties : undefined);
}

export function clearUserContext() {
  const posthog = getPostHogClient();
  posthog?.reset();
}

export function logEvent(message: string, options: SentryEventOptions = {}) {
  const posthog = getPostHogClient();
  if (!posthog) {
    return;
  }
  posthog.capture(message, buildEventProperties(options));
}

export function logError(error: unknown, options: SentryEventOptions = {}) {
  const posthog = getPostHogClient();
  if (!posthog) {
    return;
  }
  const normalizedError = toErrorObject(error);
  posthog.captureException(normalizedError, {
    ...buildEventProperties(options),
    error_name: normalizedError.name,
    error_message: normalizedError.message,
  });
}
