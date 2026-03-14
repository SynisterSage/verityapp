import { PostHog } from 'posthog-react-native';

import { getPublicEnv } from './publicConfig';

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const DEFAULT_FLUSH_AT = 20;

let cachedClient: PostHog | null = null;
let hasInitializedClient = false;

type PostHogConfig = {
  apiKey: string;
  host: string;
};

function getPostHogConfig(): PostHogConfig | null {
  const apiKey = getPublicEnv('EXPO_PUBLIC_POSTHOG_KEY').trim();
  if (!apiKey) {
    return null;
  }
  const host = getPublicEnv('EXPO_PUBLIC_POSTHOG_HOST').trim() || DEFAULT_POSTHOG_HOST;

  return { apiKey, host };
}

export function getPostHogClient() {
  if (hasInitializedClient) {
    return cachedClient;
  }

  hasInitializedClient = true;
  const config = getPostHogConfig();
  if (!config) {
    return null;
  }

  cachedClient = new PostHog(config.apiKey, {
    host: config.host,
    captureAppLifecycleEvents: true,
    flushAt: DEFAULT_FLUSH_AT,
  });
  return cachedClient;
}
