import Constants from 'expo-constants';

const BUNDLED_PUBLIC_ENV: Record<string, string | undefined> = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  EXPO_PUBLIC_APP_STORE_URL: process.env.EXPO_PUBLIC_APP_STORE_URL,
  EXPO_PUBLIC_PLAY_STORE_URL: process.env.EXPO_PUBLIC_PLAY_STORE_URL,
};

function readBundledEnvValue(key: string): string {
  const value = BUNDLED_PUBLIC_ENV[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return '';
}

function readExtraValue(key: string): string {
  const fromExpoConfig = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.[key];
  if (typeof fromExpoConfig === 'string' && fromExpoConfig.trim().length > 0) {
    return fromExpoConfig.trim();
  }

  const fromManifest = (Constants.manifest2?.extra?.expoClient as Record<string, unknown> | undefined)?.[key];
  if (typeof fromManifest === 'string' && fromManifest.trim().length > 0) {
    return fromManifest.trim();
  }

  return '';
}

export function getPublicEnv(key: string): string {
  const fromBundled = readBundledEnvValue(key);
  if (fromBundled.length > 0) {
    return fromBundled;
  }

  const fromProcess = (process.env[key] ?? '').trim();
  if (fromProcess.length > 0) {
    return fromProcess;
  }
  return readExtraValue(key);
}
