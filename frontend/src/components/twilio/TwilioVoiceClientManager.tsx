import { AppState, Platform, NativeModules, NativeEventEmitter } from 'react-native';
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

const { VoIPPushModule } = NativeModules;

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
  const registeredIdentityRef = useRef<string | null>(null);
  const unavailableEventsRef = useRef<Set<string>>(new Set());
  const initInFlightRef = useRef(false);
  const lastInitAtRef = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const activeCallSidRef = useRef<string | null>(null);
  const isInitialMountRef = useRef(true);
  const REFRESH_MIN_INTERVAL_MS = 120_000;
  const INIT_MIN_INTERVAL_MS = 15_000;

  const clearActiveCall = () => {
    activeCallSidRef.current = null;
    dismissActiveCall();
  };

  const refreshSessionIfNeeded = (reason: string) => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) {
      return;
    }
    lastRefreshAtRef.current = now;
    console.info('[twilio-voice] session refresh', { reason });
    refreshTwilioClientSession().catch(() => {
      /* handled in context */
    });
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

        // Only navigate if call is actually active (not ended/failed/disconnected)
        const activeStates = ['ringing', 'connecting', 'connected', 'reconnecting'];
        if (!activeStates.includes(session.state?.toLowerCase() || '')) {
          console.info('[twilio-voice] Skipping hydrate for non-active call state:', session.state);
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
      registeredIdentityRef.current = null;
      initInFlightRef.current = false;
      TwilioVoice.unregister();
      return;
    }
    if (
      registeredTokenRef.current === twilioClientToken &&
      registeredIdentityRef.current === twilioClientIdentity
    ) {
      return;
    }
    if (initInFlightRef.current) {
      return;
    }
    const now = Date.now();
    if (
      now - lastInitAtRef.current < INIT_MIN_INTERVAL_MS &&
      registeredIdentityRef.current === twilioClientIdentity
    ) {
      return;
    }
    let cancelled = false;
    initInFlightRef.current = true;
    lastInitAtRef.current = now;
    console.info('[twilio-voice] initWithToken start', { identity: twilioClientIdentity });
    TwilioVoice.initWithToken(twilioClientToken)
      .then(() => {
        if (cancelled) return;
        registeredTokenRef.current = twilioClientToken;
        registeredIdentityRef.current = twilioClientIdentity;
        initInFlightRef.current = false;
        console.info('[twilio-voice] initWithToken success', { identity: twilioClientIdentity });
      })
      .catch((err: unknown) => {
        initInFlightRef.current = false;
        console.warn('TwilioVoice init failed', err);
        refreshSessionIfNeeded('init_failed');
      });
    return () => {
      cancelled = true;
      initInFlightRef.current = false;
    };
  }, [isTwilioClientReady, refreshTwilioClientSession, twilioClientIdentity, twilioClientToken]);

  useEffect(() => {
    const registeredEvents: Array<{ type: string; handler: (data: unknown) => void }> = [];
    const registerEvent = (type: string, handler: (data: unknown) => void) => {
      try {
        TwilioVoice.addEventListener(type, handler);
        registeredEvents.push({ type, handler });
      } catch (err) {
        if (!unavailableEventsRef.current.has(type)) {
          unavailableEventsRef.current.add(type);
          console.info('[twilio-voice] optional event unavailable', {
            type,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    const handleIncoming = (data: unknown) => {
      console.info('TwilioVoice incoming invite', data);
      const parsed = parseTwilioEventData(data);

      // Only navigate if we have a valid callSid (not stale/empty data)
      if (!parsed.callSid) {
        console.warn('[twilio-voice] Ignoring incoming invite without callSid');
        return;
      }

      reportLifecycle('ringing', data);
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
      refreshSessionIfNeeded('device_not_ready');
    };
    const handleDisconnect = () => {
      console.info('TwilioVoice connection disconnected');
      reportLifecycle('disconnected', null, activeCallSidRef.current);
      clearActiveCall();
    };
    const handleConnecting = (data: unknown) => {
      console.info('TwilioVoice connecting', data);
      const parsed = parseTwilioEventData(data);
      const callSid = parsed.callSid ?? activeCallSidRef.current;

      // Only navigate if we have a valid callSid
      if (!callSid) {
        console.warn('[twilio-voice] Ignoring connecting event without callSid');
        return;
      }

      reportLifecycle('connecting', data);
      navigateToActiveCall({
        callSid,
        fromNumber: parsed.fromNumber,
        toNumber: parsed.toNumber,
        status: 'Connecting',
      });
    };
    const handleConnect = (data: unknown) => {
      console.info('TwilioVoice connection connected', data);
      const parsed = parseTwilioEventData(data);
      const callSid = parsed.callSid ?? activeCallSidRef.current;

      // Only navigate if we have a valid callSid
      if (!callSid) {
        console.warn('[twilio-voice] Ignoring connect event without callSid');
        return;
      }

      reportLifecycle('connected', data);
      navigateToActiveCall({
        callSid,
        fromNumber: parsed.fromNumber,
        toNumber: parsed.toNumber,
        status: 'Connected',
      });
    };
    const handleReconnecting = (data: unknown) => {
      console.info('TwilioVoice reconnecting', data);
      const parsed = parseTwilioEventData(data);
      const callSid = parsed.callSid ?? activeCallSidRef.current;

      // Only navigate if we have a valid callSid
      if (!callSid) {
        console.warn('[twilio-voice] Ignoring reconnecting event without callSid');
        return;
      }

      reportLifecycle('reconnecting', data, activeCallSidRef.current);
      navigateToActiveCall({
        callSid,
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

    registerEvent('deviceReady', handleDeviceReady);
    registerEvent('deviceNotReady', handleDeviceNotReady);
    registerEvent('deviceDidReceiveIncoming', handleIncoming);
    registerEvent('connectionDidDisconnect', handleDisconnect);
    registerEvent('callStateConnecting', handleConnecting);
    registerEvent('connectionIsReconnecting', handleReconnecting);
    registerEvent('connectionDidReconnect', handleConnect);
    registerEvent('connectionDidFail', handleConnectFailure);
    registerEvent('callStateConnectFailure', handleConnectFailure);
    registerEvent('connectionDidConnect', handleConnect);
    registerEvent('callInviteCancelled', handleInviteCancelled);
    registerEvent('callStateRinging', handleRinging);

    return () => {
      registeredEvents.forEach(({ type, handler }) => {
        try {
          TwilioVoice.removeEventListener(type, handler);
        } catch {
          // Native event registry can be strict during fast refresh/strict-mode cleanup.
        }
      });
    };
  }, [activeProfile?.id, refreshTwilioClientSession, twilioClientIdentity]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (nextState: string) => {
      if (nextState === 'active') {
        // Skip hydration on initial app launch
        if (isInitialMountRef.current) {
          isInitialMountRef.current = false;
          console.info('[twilio-voice] Skipping hydrate on initial mount');
          return;
        }
        refreshSessionIfNeeded('app_active');
        hydrateActiveCall();
      }
    });
    return () => listener.remove();
  }, [activeProfile?.id, refreshTwilioClientSession]);

  return null;
}
