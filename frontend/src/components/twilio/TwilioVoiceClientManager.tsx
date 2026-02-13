import { AppState } from 'react-native';
import { useEffect, useRef } from 'react';
import TwilioVoice from 'react-native-twilio-programmable-voice';

import { useProfile } from '../../context/ProfileContext';

export default function TwilioVoiceClientManager() {
  const {
    isTwilioClientReady,
    twilioClientToken,
    twilioClientIdentity,
    refreshTwilioClientSession,
  } = useProfile();
  const registeredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    // iOS requires CallKit configuration for incoming invites to surface as system call UI.
    TwilioVoice.configureCallKit({
      appName: 'Verity Protect',
    });
    console.info('[twilio-voice] callkit configured');
  }, []);

  useEffect(() => {
    console.info('[twilio-voice] manager state', {
      isTwilioClientReady,
      hasToken: Boolean(twilioClientToken),
      identity: twilioClientIdentity ?? null,
    });
    if (!isTwilioClientReady || !twilioClientToken || !twilioClientIdentity) {
      registeredTokenRef.current = null;
      TwilioVoice.unregister();
      return;
    }
    if (registeredTokenRef.current === twilioClientToken) {
      return;
    }
    let cancelled = false;
    console.info('[twilio-voice] initWithToken start', { identity: twilioClientIdentity });
    TwilioVoice.initWithToken(twilioClientToken)
      .then(() => {
        if (cancelled) {
          return;
        }
        registeredTokenRef.current = twilioClientToken;
        console.info('[twilio-voice] initWithToken success', { identity: twilioClientIdentity });
      })
      .catch((err: any) => {
        console.warn('TwilioVoice init failed', err);
        refreshTwilioClientSession().catch(() => {
          /* handled in context */
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    isTwilioClientReady,
    twilioClientToken,
    twilioClientIdentity,
  ]);

  useEffect(() => {
    const handleIncoming = (data: unknown) => {
      console.info('TwilioVoice incoming invite', data);
    };
    const handleDeviceReady = () => {
      console.info('TwilioVoice device ready');
    };
    const handleDeviceNotReady = (data: unknown) => {
      console.warn('TwilioVoice device not ready', data);
      refreshTwilioClientSession().catch(() => {
        /* handled in context */
      });
    };
    const handleDisconnect = () => {
      console.info('TwilioVoice connection disconnected');
    };
    const handleConnect = (data: unknown) => {
      console.info('TwilioVoice connection connected', data);
    };
    const handleInviteCancelled = (data: unknown) => {
      console.info('TwilioVoice invite cancelled', data);
    };
    const handleRinging = (data: unknown) => {
      console.info('TwilioVoice ringing', data);
    };

    TwilioVoice.addEventListener('deviceReady', handleDeviceReady);
    TwilioVoice.addEventListener('deviceNotReady', handleDeviceNotReady);
    TwilioVoice.addEventListener('deviceDidReceiveIncoming', handleIncoming);
    TwilioVoice.addEventListener('connectionDidDisconnect', handleDisconnect);
    TwilioVoice.addEventListener('connectionDidConnect', handleConnect);
    TwilioVoice.addEventListener('callInviteCancelled', handleInviteCancelled);
    TwilioVoice.addEventListener('callStateRinging', handleRinging);

    return () => {
      TwilioVoice.removeEventListener('deviceReady', handleDeviceReady);
      TwilioVoice.removeEventListener('deviceNotReady', handleDeviceNotReady);
      TwilioVoice.removeEventListener('deviceDidReceiveIncoming', handleIncoming);
      TwilioVoice.removeEventListener('connectionDidDisconnect', handleDisconnect);
      TwilioVoice.removeEventListener('connectionDidConnect', handleConnect);
      TwilioVoice.removeEventListener('callInviteCancelled', handleInviteCancelled);
      TwilioVoice.removeEventListener('callStateRinging', handleRinging);
    };
  }, [refreshTwilioClientSession]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (nextState: string) => {
      if (nextState === 'active') {
        refreshTwilioClientSession().catch(() => {
          /* handled in context */
        });
      }
    });
    return () => listener.remove();
  }, [refreshTwilioClientSession]);

  return null;
}
