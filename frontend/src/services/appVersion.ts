import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { supabase } from './supabase';
import { logEvent } from './sentry';

export type AppVersionPolicy = {
  platform: 'ios' | 'android';
  latestVersion: string | null;
  minSupportedVersion: string | null;
  softPromptEnabled: boolean;
  hardBlockEnabled: boolean;
  updateMessage: string | null;
  storeUrl: string | null;
};

export type AppUpdateStatus = {
  currentVersion: string;
  latestVersion: string | null;
  minSupportedVersion: string | null;
  shouldPrompt: boolean;
  isRequired: boolean;
  updateMessage: string | null;
  storeUrl: string | null;
};

const VERSION_REGEX = /\d+/g;

function normalizeVersion(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
}

export function getCurrentAppVersion(): string {
  const nativeVersion = Application.nativeApplicationVersion;
  const expoVersion = Constants.expoConfig?.version;
  if (typeof nativeVersion === 'string' && nativeVersion.trim()) {
    return nativeVersion.trim();
  }
  if (typeof expoVersion === 'string' && expoVersion.trim()) {
    return expoVersion.trim();
  }
  return '0.0.0';
}

export function compareVersions(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  const aParts = (a.match(VERSION_REGEX) ?? []).map((part) => Number(part));
  const bParts = (b.match(VERSION_REGEX) ?? []).map((part) => Number(part));
  const maxLen = Math.max(aParts.length, bParts.length, 3);
  for (let i = 0; i < maxLen; i += 1) {
    const left = Number.isFinite(aParts[i]) ? aParts[i] : 0;
    const right = Number.isFinite(bParts[i]) ? bParts[i] : 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

export async function fetchAppVersionPolicy(): Promise<AppVersionPolicy | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return null;
  }
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { data, error } = await supabase
    .from('app_versions')
    .select(
      'platform, latest_version, min_supported_version, soft_prompt_enabled, hard_block_enabled, update_message, store_url'
    )
    .eq('platform', platform)
    .maybeSingle();

  if (error) {
    logEvent('app_update_policy_fetch_failed', {
      screen: 'App',
      level: 'warning',
      extra: { platform, reason: error.message },
    });
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    platform,
    latestVersion: normalizeVersion(data.latest_version),
    minSupportedVersion: normalizeVersion(data.min_supported_version),
    softPromptEnabled: Boolean(data.soft_prompt_enabled),
    hardBlockEnabled: Boolean(data.hard_block_enabled),
    updateMessage: normalizeVersion(data.update_message),
    storeUrl: normalizeVersion(data.store_url),
  };
}

export function evaluateAppUpdateStatus(policy: AppVersionPolicy | null): AppUpdateStatus | null {
  if (!policy) {
    return null;
  }
  const currentVersion = getCurrentAppVersion();
  const latestVersion = policy.latestVersion;
  const minSupportedVersion = policy.minSupportedVersion;

  const isBelowMin =
    minSupportedVersion !== null && compareVersions(currentVersion, minSupportedVersion) < 0;
  const isBehindLatest =
    latestVersion !== null && compareVersions(currentVersion, latestVersion) < 0;

  const isRequired = Boolean(policy.hardBlockEnabled && isBelowMin);
  const shouldPrompt = Boolean(policy.softPromptEnabled && isBehindLatest) || isRequired;

  if (!shouldPrompt) {
    return null;
  }

  return {
    currentVersion,
    latestVersion,
    minSupportedVersion,
    shouldPrompt,
    isRequired,
    updateMessage: policy.updateMessage,
    storeUrl: policy.storeUrl,
  };
}
