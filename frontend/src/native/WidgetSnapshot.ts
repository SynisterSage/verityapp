import { NativeModules, Platform } from 'react-native';

const WidgetSnapshotModule = NativeModules.WidgetSnapshotModule as
  | {
      updateSnapshot: (payload: {
        needsAttentionCount: number;
        historyCount: number;
        profileId?: string;
        lastUpdatedEpochSeconds?: number;
      }) => Promise<unknown>;
      clearSnapshot: () => Promise<unknown>;
      consumePendingSiriRoute: () => Promise<{ route?: string | null } | unknown>;
    }
  | undefined;

export type WidgetSnapshotPayload = {
  needsAttentionCount: number;
  historyCount: number;
  profileId?: string;
  lastUpdatedEpochSeconds?: number;
};

function ensureModule() {
  if (!WidgetSnapshotModule) {
    throw new Error('WidgetSnapshotModule is not available.');
  }
  return WidgetSnapshotModule;
}

export async function updateWidgetSnapshot(payload: WidgetSnapshotPayload) {
  if (Platform.OS !== 'ios') return;
  await ensureModule().updateSnapshot(payload);
}

export async function clearWidgetSnapshot() {
  if (Platform.OS !== 'ios') return;
  await ensureModule().clearSnapshot();
}

export async function consumePendingSiriRoute(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  const result = (await ensureModule().consumePendingSiriRoute()) as
    | { route?: string | null }
    | undefined
    | null;
  const route = result?.route;
  return typeof route === 'string' && route.trim().length > 0 ? route.trim() : null;
}
