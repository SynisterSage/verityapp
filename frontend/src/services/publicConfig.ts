import Constants from 'expo-constants';

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
  const fromProcess = (process.env[key] ?? '').trim();
  if (fromProcess.length > 0) {
    return fromProcess;
  }
  return readExtraValue(key);
}

