import { AppState } from 'react-native';
import { useEffect, useRef } from 'react';
import TwilioVoice from 'react-native-twilio-programmable-voice';

import { useProfile } from '../../context/ProfileContext';

const HEARTBEAT_INTERVAL = 45_000;

export default function TwilioVoiceClientManager() {
  const {
    isTwilioClientReady,
    twilioClientToken,
    twilioClientIdentity,
    refreshTwilioClientSession,
  } = useProfile();
  const registeredTokenRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isTwilioClientReady || !twilioClientToken || !twilioClientIdentity) {
      registeredTokenRef.current = null;
      TwilioVoice.unregister();
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }
    if (registeredTokenRef.current === twilioClientToken) {
      return;
    }
    let cancelled = false;
    TwilioVoice.initWithToken(twilioClientToken)
      .then(() => {
        if (cancelled) {
          return;
        }
        registeredTokenRef.current = twilioClientToken;
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
        }
        heartbeatRef.current = setInterval(() => {
          refreshTwilioClientSession().catch(() => {
            /* handled in context */ 
          });
        }, HEARTBEAT_INTERVAL);
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
    refreshTwilioClientSession,
  ]);

  useEffect(() => {
    const handleIncoming = (data: unknown) => {
      console.info('TwilioVoice incoming invite', data);
      TwilioVoice.accept();
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

    TwilioVoice.addEventListener('deviceReady', handleDeviceReady);
    TwilioVoice.addEventListener('deviceNotReady', handleDeviceNotReady);
    TwilioVoice.addEventListener('deviceDidReceiveIncoming', handleIncoming);
    TwilioVoice.addEventListener('connectionDidDisconnect', handleDisconnect);

    return () => {
      TwilioVoice.removeEventListener('deviceReady', handleDeviceReady);
      TwilioVoice.removeEventListener('deviceNotReady', handleDeviceNotReady);
      TwilioVoice.removeEventListener('deviceDidReceiveIncoming', handleIncoming);
      TwilioVoice.removeEventListener('connectionDidDisconnect', handleDisconnect);
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
