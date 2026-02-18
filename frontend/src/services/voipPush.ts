import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type { VoIPCallActionEvent, VoIPPushPayload, VoIPTokenUpdate } from '../types/voip-push';
import { authorizedFetch } from './backend';

const { VoIPPushModule } = NativeModules;

let voipEventEmitter: NativeEventEmitter | null = null;
let tokenListener: any = null;
let pushListener: any = null;
let answerListener: any = null;
let endListener: any = null;

export interface VoIPCallHandlers {
  onTokenUpdate: (token: string) => void;
  onIncomingCall: (payload: VoIPPushPayload) => void;
  onCallAnswered?: (callUUID: string) => void;
  onCallEnded?: (callUUID: string) => void;
}

/**
 * Initialize VoIP push notifications (iOS only)
 * Registers for PushKit notifications that can wake the app from any state
 */
export function initializeVoIPPush(handlers: VoIPCallHandlers): () => void {
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
        handlers.onTokenUpdate(data.token);
      }
    }
  );

  // Listen for incoming VoIP pushes
  pushListener = voipEventEmitter.addListener(
    'voipPushReceived',
    (payload: VoIPPushPayload) => {
      console.info('[VoIPPush] Incoming call:', payload);
      handlers.onIncomingCall(payload);
    }
  );

  // Listen for call answered via CallKit
  answerListener = voipEventEmitter.addListener(
    'callAnswered',
    (data: { callUUID: string }) => {
      console.info('[VoIPPush] Call answered via CallKit:', data.callUUID);
      if (handlers.onCallAnswered) {
        handlers.onCallAnswered(data.callUUID);
      }
    }
  );

  // Listen for call ended via CallKit
  endListener = voipEventEmitter.addListener(
    'callEnded',
    (data: { callUUID: string }) => {
      console.info('[VoIPPush] Call ended via CallKit:', data.callUUID);
      if (handlers.onCallEnded) {
        handlers.onCallEnded(data.callUUID);
      }
    }
  );

  // Register for VoIP pushes
  VoIPPushModule.registerForVoIPPushes();
  console.info('[VoIPPush] Registered for VoIP push notifications');

  // Recover state in case a push/token update happened before JS listeners were attached.
  if (typeof VoIPPushModule.getCurrentVoIPToken === 'function') {
    VoIPPushModule.getCurrentVoIPToken()
      .then((token: string | null) => {
        if (token) {
          console.info('[VoIPPush] Recovered current token from native module');
          handlers.onTokenUpdate(token);
        }
      })
      .catch((error: unknown) => {
        console.warn('[VoIPPush] Failed to recover current token:', error);
      });
  }

  if (typeof VoIPPushModule.consumeLastVoIPPush === 'function') {
    VoIPPushModule.consumeLastVoIPPush()
      .then((payload: VoIPPushPayload | null) => {
        if (payload?.callSid) {
          console.info('[VoIPPush] Recovered pending incoming call from native module');
          handlers.onIncomingCall(payload);
        }
      })
      .catch((error: unknown) => {
        console.warn('[VoIPPush] Failed to recover pending incoming call:', error);
      });
  }

  if (typeof VoIPPushModule.consumePendingCallActions === 'function') {
    VoIPPushModule.consumePendingCallActions()
      .then((actions: VoIPCallActionEvent[] | null) => {
        if (!actions || actions.length === 0) {
          return;
        }
        actions.forEach((action) => {
          if (!action?.callUUID) {
            return;
          }
          if (action.type === 'callAnswered') {
            console.info('[VoIPPush] Recovered pending CallKit answer action');
            handlers.onCallAnswered?.(action.callUUID);
            return;
          }
          if (action.type === 'callEnded') {
            console.info('[VoIPPush] Recovered pending CallKit end action');
            handlers.onCallEnded?.(action.callUUID);
          }
        });
      })
      .catch((error: unknown) => {
        console.warn('[VoIPPush] Failed to recover pending call actions:', error);
      });
  }

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
    if (answerListener) {
      answerListener.remove();
      answerListener = null;
    }
    if (endListener) {
      endListener.remove();
      endListener = null;
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
