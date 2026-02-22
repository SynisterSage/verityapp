import { NativeModules, Platform } from 'react-native';

type LiveCallPayload = {
  callSid: string;
  profileId?: string;
  status: string;
  label: string;
  callerName: string;
  callerNumber?: string | null;
  isTrusted: boolean;
  connectedAtEpochSeconds?: number | null;
};

const VerityLiveActivityModule = NativeModules.VerityLiveActivityModule as
  | {
      startCallActivity: (payload: LiveCallPayload) => Promise<unknown>;
      updateCallActivity: (payload: LiveCallPayload) => Promise<unknown>;
      endCallActivity: (payload: Partial<LiveCallPayload> & { callSid: string }) => Promise<unknown>;
    }
  | undefined;

function ensureModule() {
  if (!VerityLiveActivityModule) {
    throw new Error('VerityLiveActivityModule is not available.');
  }
  return VerityLiveActivityModule;
}

export async function startLiveCallActivity(payload: LiveCallPayload) {
  if (Platform.OS !== 'ios') return;
  await ensureModule().startCallActivity(payload);
}

export async function updateLiveCallActivity(payload: LiveCallPayload) {
  if (Platform.OS !== 'ios') return;
  await ensureModule().updateCallActivity(payload);
}

export async function endLiveCallActivity(
  payload: Partial<LiveCallPayload> & { callSid: string }
) {
  if (Platform.OS !== 'ios') return;
  await ensureModule().endCallActivity(payload);
}
