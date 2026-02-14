import { AppState } from 'react-native';
import { useEffect, useRef } from 'react';
import TwilioVoice from 'react-native-twilio-programmable-voice';

import { useProfile } from '../../context/ProfileContext';
import {
  fetchTwilioClientActiveCall,
  recordTwilioClientCallLifecycle,
  TwilioClientCallLifecyclePayload,
  TwilioClientCallLifecycleState,
} from '../../services/twilioClient';
import { dismissActiveCall, navigateToActiveCall } from '../../navigation/rootNavigator';

type TwilioEventData = {
  call_sid?: string;
  callSid?: string;
  call_from?: string;
  from?: string;
  call_to?: string;
  to?: string;
  call_uuid?: string;
  callUuid?: string;
};

function parseTwilioEventData(data: unknown) {
  const payload = (data && typeof data === 'object' ? (data as TwilioEventData) : {}) as TwilioEventData;
  const callSid = payload.call_sid ?? payload.callSid;
  const fromNumber = payload.call_from ?? payload.from ?? null;
  const toNumber = payload.call_to ?? payload.to ?? null;
  const callUuid = payload.call_uuid ?? payload.callUuid;
  return {
    callSid: typeof callSid === 'string' ? callSid : undefined,
    fromNumber: typeof fromNumber === 'string' ? fromNumber : null,
    toNumber: typeof toNumber === 'string' ? toNumber : null,
    callUuid: typeof callUuid === 'string' ? callUuid : undefined,
  };
}

export default function TwilioVoiceClientManager() {
  const {
    activeProfile,
    isTwilioClientReady,
    twilioClientToken,
    twilioClientIdentity,
    refreshTwilioClientSession,
  } = useProfile();
  const registeredTokenRef = useRef<string | null>(null);
  const activeCallSidRef = useRef<string | null>(null);

  const clearActiveCall = () => {
    activeCallSidRef.current = null;
    dismissActiveCall();
  };

  const reportLifecycle = (
    state: TwilioClientCallLifecycleState,
    eventData: unknown,
    fallbackCallSid?: string | null
  ) => {
    const profileId = activeProfile?.id;
    if (!profileId) return;

    const parsed = parseTwilioEventData(eventData);
    const callSid = parsed.callSid ?? fallbackCallSid ?? activeCallSidRef.current;
    if (!callSid) return;

    if (state === 'ringing' || state === 'connecting' || state === 'connected' || state === 'reconnecting') {
      activeCallSidRef.current = callSid;
    }

    const payload: TwilioClientCallLifecyclePayload = {
      callSid,
      callUuid: parsed.callUuid,
      direction: 'incoming',
      state,
      fromNumber: parsed.fromNumber,
      toNumber: parsed.toNumber,
      toClientIdentity: twilioClientIdentity ?? null,
      eventAt: new Date().toISOString(),
      metadata: {},
    };

    recordTwilioClientCallLifecycle(profileId, payload).catch((err) => {
      console.warn('[twilio-voice] lifecycle sync failed', {
        state,
        callSid,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  };

  const hydrateActiveCall = () => {
    const profileId = activeProfile?.id;
    if (!profileId) return;
    fetchTwilioClientActiveCall(profileId)
      .then((result) => {
        const session = result?.session;
        if (!session) {
          clearActiveCall();
          return;
        }
        activeCallSidRef.current = session.call_sid;
        navigateToActiveCall({
          callSid: session.call_sid,
          fromNumber: session.from_number,
          toNumber: session.to_number,
          status: session.state,
        });
      })
      .catch((err) => {
        console.warn('[twilio-voice] active-call hydrate failed', {
          message: err instanceof Error ? err.message : String(err),
        });
      });
  };

  useEffect(() => {
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
        if (cancelled) return;
        registeredTokenRef.current = twilioClientToken;
        console.info('[twilio-voice] initWithToken success', { identity: twilioClientIdentity });
      })
      .catch((err: unknown) => {
        console.warn('TwilioVoice init failed', err);
        refreshTwilioClientSession().catch(() => {
          /* handled in context */
        });
      });
    return () => {
      cancelled = true;
    };
  }, [isTwilioClientReady, refreshTwilioClientSession, twilioClientIdentity, twilioClientToken]);

  useEffect(() => {
    const handleIncoming = (data: unknown) => {
      console.info('TwilioVoice incoming invite', data);
      reportLifecycle('ringing', data);
      const parsed = parseTwilioEventData(data);
      navigateToActiveCall({
        callSid: parsed.callSid,
        fromNumber: parsed.fromNumber,
        toNumber: parsed.toNumber,
        status: 'Ringing',
      });
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
      reportLifecycle('disconnected', null, activeCallSidRef.current);
      clearActiveCall();
    };
    const handleConnecting = (data: unknown) => {
      console.info('TwilioVoice connecting', data);
      reportLifecycle('connecting', data);
      const parsed = parseTwilioEventData(data);
      navigateToActiveCall({
        callSid: parsed.callSid ?? activeCallSidRef.current ?? undefined,
        fromNumber: parsed.fromNumber,
        toNumber: parsed.toNumber,
        status: 'Connecting',
      });
    };
    const handleConnect = (data: unknown) => {
      console.info('TwilioVoice connection connected', data);
      reportLifecycle('connected', data);
      const parsed = parseTwilioEventData(data);
      navigateToActiveCall({
        callSid: parsed.callSid ?? activeCallSidRef.current ?? undefined,
        fromNumber: parsed.fromNumber,
        toNumber: parsed.toNumber,
        status: 'Connected',
      });
    };
    const handleReconnecting = (data: unknown) => {
      console.info('TwilioVoice reconnecting', data);
      reportLifecycle('reconnecting', data, activeCallSidRef.current);
      const parsed = parseTwilioEventData(data);
      navigateToActiveCall({
        callSid: parsed.callSid ?? activeCallSidRef.current ?? undefined,
        fromNumber: parsed.fromNumber,
        toNumber: parsed.toNumber,
        status: 'Reconnecting',
      });
    };
    const handleConnectFailure = (data: unknown) => {
      console.info('TwilioVoice connection failed', data);
      reportLifecycle('failed', data, activeCallSidRef.current);
      clearActiveCall();
    };
    const handleInviteCancelled = (data: unknown) => {
      console.info('TwilioVoice invite cancelled', data);
      reportLifecycle('ended', data, activeCallSidRef.current);
      clearActiveCall();
    };
    const handleRinging = (data: unknown) => {
      console.info('TwilioVoice ringing', data);
      reportLifecycle('ringing', data);
    };

    TwilioVoice.addEventListener('deviceReady', handleDeviceReady);
    TwilioVoice.addEventListener('deviceNotReady', handleDeviceNotReady);
    TwilioVoice.addEventListener('deviceDidReceiveIncoming', handleIncoming);
    TwilioVoice.addEventListener('connectionDidDisconnect', handleDisconnect);
    TwilioVoice.addEventListener('callStateConnecting', handleConnecting);
    TwilioVoice.addEventListener('connectionIsReconnecting', handleReconnecting);
    TwilioVoice.addEventListener('connectionDidReconnect', handleConnect);
    TwilioVoice.addEventListener('connectionDidFail', handleConnectFailure);
    TwilioVoice.addEventListener('callStateConnectFailure', handleConnectFailure);
    TwilioVoice.addEventListener('connectionDidConnect', handleConnect);
    TwilioVoice.addEventListener('callInviteCancelled', handleInviteCancelled);
    TwilioVoice.addEventListener('callStateRinging', handleRinging);

    return () => {
      TwilioVoice.removeEventListener('deviceReady', handleDeviceReady);
      TwilioVoice.removeEventListener('deviceNotReady', handleDeviceNotReady);
      TwilioVoice.removeEventListener('deviceDidReceiveIncoming', handleIncoming);
      TwilioVoice.removeEventListener('connectionDidDisconnect', handleDisconnect);
      TwilioVoice.removeEventListener('callStateConnecting', handleConnecting);
      TwilioVoice.removeEventListener('connectionIsReconnecting', handleReconnecting);
      TwilioVoice.removeEventListener('connectionDidReconnect', handleConnect);
      TwilioVoice.removeEventListener('connectionDidFail', handleConnectFailure);
      TwilioVoice.removeEventListener('callStateConnectFailure', handleConnectFailure);
      TwilioVoice.removeEventListener('connectionDidConnect', handleConnect);
      TwilioVoice.removeEventListener('callInviteCancelled', handleInviteCancelled);
      TwilioVoice.removeEventListener('callStateRinging', handleRinging);
    };
  }, [activeProfile?.id, refreshTwilioClientSession, twilioClientIdentity]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (nextState: string) => {
      if (nextState === 'active') {
        refreshTwilioClientSession().catch(() => {
          /* handled in context */
        });
        hydrateActiveCall();
      }
    });
    return () => listener.remove();
  }, [activeProfile?.id, refreshTwilioClientSession]);

  useEffect(() => {
    hydrateActiveCall();
  }, [activeProfile?.id]);

  return null;
}
