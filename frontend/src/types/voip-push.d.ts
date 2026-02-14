declare module 'react-native' {
  interface NativeModulesStatic {
    VoIPPushModule: {
      registerForVoIPPushes(): void;
      reportIncomingCall(
        callUUID: string,
        callSid: string,
        fromNumber: string,
        toNumber: string
      ): Promise<{ success: boolean; callUUID: string }>;
      endCall(callUUID: string): Promise<{ success: boolean }>;
      addListener(eventType: string): void;
      removeListeners(count: number): void;
    };
  }
}

export interface VoIPPushPayload {
  callSid: string;
  fromNumber: string;
  toNumber: string;
  callUUID: string;
}

export interface VoIPTokenUpdate {
  token: string | null;
}
