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
import {
  getPlaceholderCallUUID,
  clearPlaceholderCallUUID,
  consumeAutoAcceptNextIncomingCall,
} from '../../services/voipPlaceholderCall';
import { endCall, answerLatestIncomingCall } from '../../services/voipPush';
import {
  endLiveCallActivity,
  startLiveCallActivity,
  updateLiveCallActivity,
} from '../../native/LiveCallActivity';
import {
  clearIncomingCallMetadata,
  getIncomingCallMetadata,
} from '../../services/incomingCallMetadata';

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
  caller_name?: string;
  callerName?: string;
};

function parseTwilioEventData(data: unknown) {
  const payload = (data && typeof data === 'object' ? (data as TwilioEventData) : {}) as TwilioEventData;
  const callSid = payload.call_sid ?? payload.callSid;
  const fromNumber = payload.call_from ?? payload.from ?? null;
  const toNumber = payload.call_to ?? payload.to ?? null;
  const callUuid = payload.call_uuid ?? payload.callUuid;
  const callerName = payload.caller_name ?? payload.callerName ?? null;
  return {
    callSid: typeof callSid === 'string' ? callSid : undefined,
    fromNumber: typeof fromNumber === 'string' ? fromNumber : null,
    toNumber: typeof toNumber === 'string' ? toNumber : null,
    callUuid: typeof callUuid === 'string' ? callUuid : undefined,
    callerName: typeof callerName === 'string' ? callerName : null,
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
  const connectedAtByCallSidRef = useRef<Map<string, number>>(new Map());
  const isInitialMountRef = useRef(true);
  const REFRESH_MIN_INTERVAL_MS = 120_000;
  const INIT_MIN_INTERVAL_MS = 15_000;

  const buildLiveActivityPayload = (args: {
    callSid: string;
    status: string;
    fromNumber?: string | null;
    callerName?: string | null;
    connectedAtEpochSeconds?: number | null;
  }) => {
    const cached = getIncomingCallMetadata(args.callSid);
    const callerName =
      args.callerName?.trim() || cached?.callerName?.trim() || args.fromNumber?.trim() || 'Incoming Call';
    const callerNumber = (args.fromNumber ?? cached?.fromNumber ?? null)?.trim() || null;
    const isTrusted = Boolean(cached?.callerName?.trim() || args.callerName?.trim());

    return {
      callSid: args.callSid,
      profileId: activeProfile?.id,
      status: args.status,
      label: isTrusted ? 'Trusted Call' : 'Protected Call',
      callerName,
      callerNumber,
      isTrusted,
      connectedAtEpochSeconds: args.connectedAtEpochSeconds ?? null,
    };
  };

  const clearActiveCall = (callSid?: string | null) => {
    const targetCallSid = callSid ?? activeCallSidRef.current;
    if (targetCallSid) {
      connectedAtByCallSidRef.current.delete(targetCallSid);
      clearIncomingCallMetadata(targetCallSid);
      endLiveCallActivity({
        ...buildLiveActivityPayload({
          callSid: targetCallSid,
          status: 'Ended',
          connectedAtEpochSeconds: null,
        }),
        callSid: targetCallSid,
      }).catch((err) => {
        console.warn('[twilio-voice] failed ending live activity', {
          callSid: targetCallSid,
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }
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
        const connectedAtEpochSeconds = session.connected_at
          ? Math.floor(new Date(session.connected_at).getTime() / 1000)
          : null;
        if (connectedAtEpochSeconds) {
          connectedAtByCallSidRef.current.set(session.call_sid, connectedAtEpochSeconds);
        }
        const normalizedStatus =
          session.state.charAt(0).toUpperCase() + session.state.slice(1).toLowerCase();
        const livePayload = buildLiveActivityPayload({
          callSid: session.call_sid,
          status: normalizedStatus,
          fromNumber: session.from_number,
          connectedAtEpochSeconds:
            connectedAtEpochSeconds ??
            connectedAtByCallSidRef.current.get(session.call_sid) ??
            null,
        });
        startLiveCallActivity(livePayload).catch((err) => {
          console.warn('[twilio-voice] failed hydrating live activity', {
            callSid: session.call_sid,
            message: err instanceof Error ? err.message : String(err),
          });
        });
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
      imageName: 'logo',
      ringtoneSound: 'ringtone.wav',
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
      const shouldAutoAccept = consumeAutoAcceptNextIncomingCall();

      // Only process if we have a valid callSid (not stale/empty data)
      if (!parsed.callSid) {
        console.warn('[twilio-voice] Ignoring incoming invite without callSid');
        return;
      }

      // End placeholder CallKit call if one exists (from VoIP push)
      // Twilio SDK has now created the real CallKit call, so we can remove the placeholder
      const placeholderUUID = getPlaceholderCallUUID();
      if (placeholderUUID && !shouldAutoAccept) {
        console.info('[twilio-voice] Ending placeholder call, Twilio call is now active');
        endCall(placeholderUUID).catch((err) => {
          console.warn('[twilio-voice] Failed to end placeholder call:', err);
        });
        clearPlaceholderCallUUID();
      } else if (placeholderUUID && shouldAutoAccept) {
        console.info('[twilio-voice] Placeholder was answered; keeping handoff active for native auto-answer');
        clearPlaceholderCallUUID();
      }

      // Report lifecycle but DON'T navigate yet - let CallKit handle the incoming call UI
      // We'll navigate when user accepts and call starts connecting
      reportLifecycle('ringing', data);
      startLiveCallActivity(
        buildLiveActivityPayload({
          callSid: parsed.callSid,
          status: 'Ringing',
          fromNumber: parsed.fromNumber,
          callerName: parsed.callerName,
          connectedAtEpochSeconds: null,
        })
      ).catch((err) => {
        console.warn('[twilio-voice] failed starting live activity', {
          callSid: parsed.callSid,
          message: err instanceof Error ? err.message : String(err),
        });
      });
      console.info('[twilio-voice] Incoming call reported, waiting for user to accept via CallKit');

      // If user already answered the placeholder CallKit call, immediately accept
      // this real Twilio invite to prevent a second ringing cycle.
      if (shouldAutoAccept) {
        console.info('[twilio-voice] Auto-answering real call after placeholder answer');
        const excludedUUID = placeholderUUID ?? undefined;
        let attempts = 0;
        const maxAttempts = 8;
        const attemptAnswer = () => {
          answerLatestIncomingCall(excludedUUID)
            .then((ok) => {
              if (ok) {
                console.info('[twilio-voice] Auto-answer request sent to CallKit');
                if (placeholderUUID) {
                  endCall(placeholderUUID).catch((err) => {
                    console.warn('[twilio-voice] Failed to close placeholder after auto-answer:', err);
                  });
                }
                return;
              }
              attempts += 1;
              if (attempts < maxAttempts) {
                setTimeout(attemptAnswer, 300);
              } else {
                console.warn('[twilio-voice] Auto-answer gave up after retries');
              }
            })
            .catch((err) => {
              console.warn('[twilio-voice] Auto-answer failed', err);
            });
        };
        attemptAnswer();
      }
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
      const callSid = activeCallSidRef.current;
      reportLifecycle('disconnected', null, callSid);
      clearActiveCall(callSid);
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
      updateLiveCallActivity(
        buildLiveActivityPayload({
          callSid,
          status: 'Connecting',
          fromNumber: parsed.fromNumber,
          callerName: parsed.callerName,
          connectedAtEpochSeconds: null,
        })
      ).catch((err) => {
        console.warn('[twilio-voice] failed updating live activity', {
          callSid,
          message: err instanceof Error ? err.message : String(err),
        });
      });
      // Don't navigate yet - wait for full connection before showing active call screen
      // This prevents showing controls before audio is established
      console.info('[twilio-voice] Call connecting, waiting for full connection before navigation');
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

      const connectedAtEpochSeconds = Math.floor(Date.now() / 1000);
      connectedAtByCallSidRef.current.set(callSid, connectedAtEpochSeconds);
      reportLifecycle('connected', data);
      updateLiveCallActivity(
        buildLiveActivityPayload({
          callSid,
          status: 'Connected',
          fromNumber: parsed.fromNumber,
          callerName: parsed.callerName,
          connectedAtEpochSeconds,
        })
      ).catch((err) => {
        console.warn('[twilio-voice] failed updating live activity', {
          callSid,
          message: err instanceof Error ? err.message : String(err),
        });
      });
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

      const connectedAtEpochSeconds =
        connectedAtByCallSidRef.current.get(callSid) ?? null;
      reportLifecycle('reconnecting', data, activeCallSidRef.current);
      updateLiveCallActivity(
        buildLiveActivityPayload({
          callSid,
          status: 'Reconnecting',
          fromNumber: parsed.fromNumber,
          callerName: parsed.callerName,
          connectedAtEpochSeconds,
        })
      ).catch((err) => {
        console.warn('[twilio-voice] failed updating live activity', {
          callSid,
          message: err instanceof Error ? err.message : String(err),
        });
      });
      navigateToActiveCall({
        callSid,
        fromNumber: parsed.fromNumber,
        toNumber: parsed.toNumber,
        status: 'Reconnecting',
      });
    };
    const handleConnectFailure = (data: unknown) => {
      console.info('TwilioVoice connection failed', data);
      const parsed = parseTwilioEventData(data);
      const callSid = parsed.callSid ?? activeCallSidRef.current;
      reportLifecycle('failed', data, callSid);
      clearActiveCall(callSid);
    };
    const handleInviteCancelled = (data: unknown) => {
      console.info('TwilioVoice invite cancelled', data);
      const parsed = parseTwilioEventData(data);
      const callSid = parsed.callSid ?? activeCallSidRef.current;
      reportLifecycle('ended', data, callSid);
      clearActiveCall(callSid);
    };
    const handleRinging = (data: unknown) => {
      console.info('TwilioVoice ringing', data);
      const parsed = parseTwilioEventData(data);
      const callSid = parsed.callSid ?? activeCallSidRef.current;
      reportLifecycle('ringing', data);
      if (!callSid) {
        return;
      }
      updateLiveCallActivity(
        buildLiveActivityPayload({
          callSid,
          status: 'Ringing',
          fromNumber: parsed.fromNumber,
          callerName: parsed.callerName,
          connectedAtEpochSeconds: null,
        })
      ).catch((err) => {
        console.warn('[twilio-voice] failed updating live activity', {
          callSid,
          message: err instanceof Error ? err.message : String(err),
        });
      });
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
