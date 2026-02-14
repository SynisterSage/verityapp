import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type { VoIPPushPayload, VoIPTokenUpdate } from '../types/voip-push';
import { authorizedFetch } from './backend';

const { VoIPPushModule } = NativeModules;

let voipEventEmitter: NativeEventEmitter | null = null;
let tokenListener: any = null;
let pushListener: any = null;

/**
 * Initialize VoIP push notifications (iOS only)
 * Registers for PushKit notifications that can wake the app from any state
 */
export function initializeVoIPPush(
  onTokenUpdate: (token: string) => void,
  onIncomingCall: (payload: VoIPPushPayload) => void
): () => void {
  if (Platform.OS !== 'ios' || !VoIPPushModule) {
    console.warn('[VoIPPush] VoIP push is only available on iOS');
    return () => {};
  }

  // Create event emitter
  voipEventEmitter = new NativeEventEmitter(VoIPPushModule);

  // Listen for token updates
  tokenListener = voipEventEmitter.addListener(
    'voipTokenUpdated',
    (data: VoIPTokenUpdate) => {
      console.info('[VoIPPush] Token updated:', data.token ? 'received' : 'invalidated');
      if (data.token) {
        onTokenUpdate(data.token);
      }
    }
  );

  // Listen for incoming VoIP pushes
  pushListener = voipEventEmitter.addListener(
    'voipPushReceived',
    (payload: VoIPPushPayload) => {
      console.info('[VoIPPush] Incoming call:', payload);
      onIncomingCall(payload);
    }
  );

  // Register for VoIP pushes
  VoIPPushModule.registerForVoIPPushes();
  console.info('[VoIPPush] Registered for VoIP push notifications');

  // Return cleanup function
  return () => {
    if (tokenListener) {
      tokenListener.remove();
      tokenListener = null;
    }
    if (pushListener) {
      pushListener.remove();
      pushListener = null;
    }
    console.info('[VoIPPush] Unregistered listeners');
  };
}

/**
 * Update VoIP push token on the backend
 */
export async function updateVoIPPushToken(
  profileId: string,
  token: string
): Promise<void> {
  try {
    await authorizedFetch(`/profiles/${profileId}/voip-token`, {
      method: 'PUT',
      body: JSON.stringify({ voipPushToken: token }),
    });

    console.info('[VoIPPush] Token updated on backend');
  } catch (error) {
    console.error('[VoIPPush] Failed to update token:', error);
    throw error;
  }
}

/**
 * Report an incoming call to CallKit
 * This is called when a VoIP push is received to show the native iOS call UI
 */
export async function reportIncomingCall(
  callUUID: string,
  callSid: string,
  fromNumber: string,
  toNumber: string
): Promise<{ success: boolean; callUUID: string }> {
  if (Platform.OS !== 'ios' || !VoIPPushModule) {
    throw new Error('CallKit is only available on iOS');
  }

  return VoIPPushModule.reportIncomingCall(callUUID, callSid, fromNumber, toNumber);
}

/**
 * End a call in CallKit
 */
export async function endCall(callUUID: string): Promise<void> {
  if (Platform.OS !== 'ios' || !VoIPPushModule) {
    return;
  }

  try {
    await VoIPPushModule.endCall(callUUID);
  } catch (error) {
    console.error('[VoIPPush] Failed to end call:', error);
  }
}
