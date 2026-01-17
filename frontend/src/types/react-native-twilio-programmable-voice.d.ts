declare module 'react-native-twilio-programmable-voice' {
  type EventHandler = (data: any) => void;

  export interface TwilioVoiceStatic {
    initWithToken(token: string): Promise<{ initialized: boolean }>;
    connect(params?: Record<string, any>): void;
    disconnect(): void;
    accept(): void;
    reject(): void;
    ignore(): void;
    setMuted(muted: boolean): void;
    setSpeakerPhone(enabled: boolean): void;
    sendDigits(digits: string): void;
    hold(hold: boolean): void;
    requestPermissions(senderId?: string): void;
    getActiveCall(): Promise<any>;
    getCallInvite(): Promise<any>;
    configureCallKit(params: Record<string, any>): void;
    unregister(): void;
    addEventListener(type: string, handler: EventHandler): void;
    removeEventListener(type: string, handler: EventHandler): void;
  }

  const TwilioVoice: TwilioVoiceStatic;
  export default TwilioVoice;
}
