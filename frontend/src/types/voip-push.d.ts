declare module 'react-native' {
  interface NativeModulesStatic {
    VoIPPushModule: {
      registerForVoIPPushes(): void;
      getCurrentVoIPToken?(): Promise<string | null>;
      consumeLastVoIPPush?(): Promise<VoIPPushPayload | null>;
      consumePendingCallActions?(): Promise<VoIPCallActionEvent[]>;
      answerLatestIncomingCall?(
        excludeCallUUID?: string | null
      ): Promise<{ success: boolean; callUUID?: string; reason?: string }>;
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
  callerName?: string;
}

export interface VoIPTokenUpdate {
  token: string | null;
}

export interface VoIPCallActionEvent {
  type: 'callAnswered' | 'callEnded';
  callUUID: string;
  callSid?: string;
  source?: string;
}
