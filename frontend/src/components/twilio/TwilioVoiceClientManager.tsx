import { AppState, Platform, NativeModules, NativeEventEmitter } from 'react-native';
import { useEffect, useRef } from 'react';
import TwilioVoice from 'react-native-twilio-programmable-voice';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useProfile } from '../../context/ProfileContext';
import {
  fetchTwilioClientActiveCall,
  recordTwilioClientCallLifecycle,
  TwilioClientCallLifecyclePayload,
  TwilioClientCallLifecycleState,
} from '../../services/twilioClient';
import { authorizedFetch } from '../../services/backend';
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
import { consumeManualHangupIntent } from '../../services/manualHangupIntent';
import { formatPhoneNumber } from '../../utils/formatPhoneNumber';

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

type NativeCallEndedEvent = {
  callUUID?: string;
  callSid?: string;
  source?: string;
};

function hasNativeCallPayload(value: unknown) {
  if (!value) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return Boolean(value);
}

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

function parseNativeCallEndedEvent(data: unknown): NativeCallEndedEvent {
  const payload =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const callUUID = typeof payload.callUUID === 'string' ? payload.callUUID : undefined;
  const callSid = typeof payload.callSid === 'string' ? payload.callSid : undefined;
  const source = typeof payload.source === 'string' ? payload.source : undefined;
  return { callUUID, callSid, source };
}

function normalizePhoneDigits(value?: string | null) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `1${digits}` : digits;
}

function trimToNull(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDisplayName(name?: string | null, rawNumber?: string | null) {
  const trimmedName = trimToNull(name);
  if (!trimmedName) return null;
  const normalizedNameDigits = normalizePhoneDigits(trimmedName);
  const normalizedRawDigits = normalizePhoneDigits(rawNumber);
  if (normalizedNameDigits && normalizedRawDigits && normalizedNameDigits === normalizedRawDigits) {
    return null;
  }
  return trimmedName;
}

function parseTrustedMapEntryName(value: unknown) {
  if (typeof value === 'string') {
    return trimToNull(value);
  }
  if (value && typeof value === 'object' && 'name' in value) {
    return trimToNull((value as { name?: string | null }).name ?? null);
  }
  return null;
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
  const trustedNameByNumberRef = useRef<Map<string, string>>(new Map());
  const livePayloadArgsByCallSidRef = useRef<
    Map<
      string,
      {
        callSid: string;
        status: string;
        fromNumber?: string | null;
        callerName?: string | null;
        connectedAtEpochSeconds?: number | null;
      }
    >
  >(new Map());
  const pendingLiveActivityEndTimerByCallSidRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const isInitialMountRef = useRef(true);
  const REFRESH_MIN_INTERVAL_MS = 120_000;
  const INIT_MIN_INTERVAL_MS = 15_000;
  const MANUAL_HANGUP_ACTIVITY_END_DELAY_MS = 1800;

  const buildLiveActivityPayload = (args: {
    callSid: string;
    status: string;
    fromNumber?: string | null;
    callerName?: string | null;
    connectedAtEpochSeconds?: number | null;
  }) => {
    livePayloadArgsByCallSidRef.current.set(args.callSid, { ...args });
    const cached = getIncomingCallMetadata(args.callSid);
    const rawNumber = trimToNull(args.fromNumber ?? cached?.fromNumber ?? null);
    const normalizedNumber = normalizePhoneDigits(rawNumber);
    const trustedName = normalizedNumber
      ? trustedNameByNumberRef.current.get(normalizedNumber) ?? null
      : null;
    const fallbackCallerName = normalizeDisplayName(args.callerName ?? cached?.callerName ?? null, rawNumber);
    const formattedNumber = rawNumber ? formatPhoneNumber(rawNumber, rawNumber) : null;
    const callerName = trustedName ?? fallbackCallerName ?? formattedNumber ?? 'Incoming Call';
    const callerNumber = trustedName || fallbackCallerName ? formattedNumber : null;
    const isTrusted = Boolean(trustedName);

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

  useEffect(() => {
    const profileId = activeProfile?.id;
    if (!profileId) {
      trustedNameByNumberRef.current.clear();
      return;
    }

    let cancelled = false;
    const nextMap = new Map<string, string>();
    const trustedMapKey = `trusted_contacts_map:${profileId}`;

    const setIfValid = (phone: string | null | undefined, name: string | null | undefined) => {
      const normalizedPhone = normalizePhoneDigits(phone);
      const normalizedName = trimToNull(name);
      if (!normalizedPhone || !normalizedName) {
        return;
      }
      nextMap.set(normalizedPhone, normalizedName);
    };

    const loadTrustedNames = async () => {
      try {
        const cached = await AsyncStorage.getItem(trustedMapKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Record<string, unknown>;
          Object.entries(parsed).forEach(([key, value]) => {
            setIfValid(key, parseTrustedMapEntryName(value));
          });
        }
      } catch (error) {
        console.warn('[twilio-voice] failed reading trusted contact cache', {
          message: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        const data = await authorizedFetch(`/fraud/trusted-contacts?profileId=${profileId}`);
        const trustedContacts = Array.isArray(data?.trusted_contacts) ? data.trusted_contacts : [];
        trustedContacts.forEach((entry: unknown) => {
          const row =
            entry && typeof entry === 'object'
              ? (entry as { caller_number?: string | null; contact_name?: string | null })
              : {};
          setIfValid(row.caller_number ?? null, trimToNull(row.contact_name ?? null));
        });
      } catch (error) {
        console.warn('[twilio-voice] failed loading trusted contacts for live activity', {
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (!cancelled) {
        trustedNameByNumberRef.current = nextMap;
        const activeCallSid = activeCallSidRef.current;
        if (activeCallSid) {
          const args = livePayloadArgsByCallSidRef.current.get(activeCallSid);
          if (args) {
            updateLiveCallActivity(buildLiveActivityPayload(args)).catch((err) => {
              console.warn('[twilio-voice] failed refreshing live activity after trusted lookup', {
                callSid: activeCallSid,
                message: err instanceof Error ? err.message : String(err),
              });
            });
          }
        }
      }
    };

    void loadTrustedNames();

    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id]);

  const clearActiveCall = (callSid?: string | null) => {
    const currentActiveCallSid = activeCallSidRef.current;
    const targetCallSid = callSid ?? currentActiveCallSid;
    if (targetCallSid) {
      const pendingEndTimer = pendingLiveActivityEndTimerByCallSidRef.current.get(targetCallSid);
      if (pendingEndTimer) {
        const shouldDismiss = currentActiveCallSid === targetCallSid;
        if (shouldDismiss) {
          activeCallSidRef.current = null;
          dismissActiveCall();
        }
        return;
      }
      connectedAtByCallSidRef.current.delete(targetCallSid);
      clearIncomingCallMetadata(targetCallSid);
      const endPayload = {
        ...buildLiveActivityPayload({
          callSid: targetCallSid,
          status: 'Ended',
          connectedAtEpochSeconds: null,
        }),
        callSid: targetCallSid,
      };
      const shouldShowEndedPreview = consumeManualHangupIntent(targetCallSid);
      const finalizeLiveActivity = () => {
        endLiveCallActivity(endPayload)
          .catch((err) => {
            console.warn('[twilio-voice] failed ending live activity', {
              callSid: targetCallSid,
              message: err instanceof Error ? err.message : String(err),
            });
          })
          .finally(() => {
            livePayloadArgsByCallSidRef.current.delete(targetCallSid);
          });
      };
      if (shouldShowEndedPreview) {
        updateLiveCallActivity(endPayload).catch((err) => {
          console.warn('[twilio-voice] failed updating ended preview live activity', {
            callSid: targetCallSid,
            message: err instanceof Error ? err.message : String(err),
          });
        });
        const timerId = setTimeout(() => {
          pendingLiveActivityEndTimerByCallSidRef.current.delete(targetCallSid);
          finalizeLiveActivity();
        }, MANUAL_HANGUP_ACTIVITY_END_DELAY_MS);
        pendingLiveActivityEndTimerByCallSidRef.current.set(targetCallSid, timerId);
      } else {
        finalizeLiveActivity();
      }
    }
    const shouldDismiss = !targetCallSid || currentActiveCallSid === targetCallSid;
    if (shouldDismiss) {
      activeCallSidRef.current = null;
      dismissActiveCall();
    }
  };

  useEffect(
    () => () => {
      pendingLiveActivityEndTimerByCallSidRef.current.forEach((timerId) => {
        clearTimeout(timerId);
      });
      pendingLiveActivityEndTimerByCallSidRef.current.clear();
    },
    []
  );

  const getNativeCallSnapshot = async () => {
    const [activeCallResult, inviteResult] = await Promise.allSettled([
      TwilioVoice.getActiveCall(),
      TwilioVoice.getCallInvite(),
    ]);
    const activeCall = activeCallResult.status === 'fulfilled' ? activeCallResult.value : null;
    const invite = inviteResult.status === 'fulfilled' ? inviteResult.value : null;

    return {
      snapshotReliable:
        activeCallResult.status === 'fulfilled' && inviteResult.status === 'fulfilled',
      hasActiveCall: hasNativeCallPayload(activeCall),
      hasPendingInvite: hasNativeCallPayload(invite),
      activeCall,
      invite,
    };
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
    fallbackCallSid?: string | null,
    metadata: Record<string, unknown> = {}
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
      metadata,
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
      .then(async (result) => {
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

        const canVerifyNativeCallState =
          isTwilioClientReady && Boolean(twilioClientToken) && Boolean(twilioClientIdentity);
        if (canVerifyNativeCallState) {
          const nativeSnapshot = await getNativeCallSnapshot();
          if (!nativeSnapshot.snapshotReliable) {
            console.info('[twilio-voice] hydrate_skip_native_verify_snapshot_unreliable', {
              callSid: session.call_sid,
              state: session.state,
            });
          } else if (!nativeSnapshot.hasActiveCall && !nativeSnapshot.hasPendingInvite) {
            console.info('[twilio-voice] hydrate_backend_active_native_inactive', {
              callSid: session.call_sid,
              state: session.state,
            });
            reportLifecycle(
              'ended',
              {
                call_sid: session.call_sid,
                call_from: session.from_number,
                call_to: session.to_number,
              },
              session.call_sid,
              {
                reason: 'stale_hydrate_cleanup',
                source: 'app_active_hydrate',
                backendState: session.state,
              }
            );
            clearActiveCall(session.call_sid);
            return;
          }

          if (nativeSnapshot.snapshotReliable) {
            console.info('[twilio-voice] hydrate_confirmed_active', {
              callSid: session.call_sid,
              state: session.state,
              hasNativeActiveCall: nativeSnapshot.hasActiveCall,
              hasPendingInvite: nativeSnapshot.hasPendingInvite,
            });
          }
        } else {
          console.info('[twilio-voice] hydrate_skipped_native_verify_client_not_ready', {
            callSid: session.call_sid,
            state: session.state,
          });
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

  const reconcileLiveActivityState = async (reason: string) => {
    try {
      const nativeSnapshot = await getNativeCallSnapshot();
      if (!nativeSnapshot.snapshotReliable) {
        console.info('[twilio-voice] reconcile_skip_snapshot_unreliable', { reason });
        return;
      }

      if (nativeSnapshot.hasActiveCall || nativeSnapshot.hasPendingInvite) {
        return;
      }

      const activeCallSid = activeCallSidRef.current;
      if (activeCallSid) {
        // Don't dismiss the active call UI here — hydrateActiveCall (called in the
        // .finally() after this) will cross-check with both native and backend and
        // dismiss cleanly if the call is truly over. Dismissing here races the
        // placeholder→real-call handoff on cold-start VoIP answer and causes a
        // visible close/reopen flash.
        console.info('[twilio-voice] reconcile_deferred_to_hydrate', { activeCallSid, reason });
        return;
      }

      await endLiveCallActivity({
        status: 'Ended',
        label: 'Protected Call',
        callerName: 'Incoming Call',
        isTrusted: false,
        connectedAtEpochSeconds: null,
      });
      livePayloadArgsByCallSidRef.current.clear();
    } catch (error) {
      console.warn('[twilio-voice] live activity reconcile failed', {
        reason,
        message: error instanceof Error ? error.message : String(error),
      });
    }
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
    const handleCallRejected = (data: unknown) => {
      console.info('TwilioVoice call rejected', data);
      const callSid = activeCallSidRef.current;
      reportLifecycle('ended', data, callSid, { reason: 'call_rejected' });
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
    registerEvent('callRejected', handleCallRejected);
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
    if (Platform.OS !== 'ios' || !VoIPPushModule) {
      return;
    }
    let voipEmitter: NativeEventEmitter;
    try {
      voipEmitter = new NativeEventEmitter(VoIPPushModule);
    } catch (error) {
      console.warn('[twilio-voice] failed to create VoIP native event emitter', error);
      return;
    }
    const subscription = voipEmitter.addListener('callEnded', (event: unknown) => {
      const parsed = parseNativeCallEndedEvent(event);
      if (parsed.source === 'placeholder_handoff') {
        return;
      }
      const callSid = parsed.callSid ?? activeCallSidRef.current;
      if (!callSid) {
        endLiveCallActivity({
          status: 'Ended',
          label: 'Protected Call',
          callerName: 'Incoming Call',
          isTrusted: false,
          connectedAtEpochSeconds: null,
        })
          .then(() => {
            livePayloadArgsByCallSidRef.current.clear();
          })
          .catch((err) => {
            console.warn('[twilio-voice] failed ending live activity from native callEnded', {
              message: err instanceof Error ? err.message : String(err),
            });
          });
        return;
      }
      reportLifecycle(
        'ended',
        {
          call_sid: callSid,
          call_uuid: parsed.callUUID,
        },
        callSid,
        {
          reason: 'callkit_end',
          source: parsed.source ?? 'callkit',
        }
      );
      clearActiveCall(callSid);
    });

    return () => {
      subscription.remove();
    };
  }, [activeProfile?.id, twilioClientIdentity]);

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
        void reconcileLiveActivityState('app_active').finally(() => {
          hydrateActiveCall();
        });
      }
    });
    return () => listener.remove();
  }, [activeProfile?.id, refreshTwilioClientSession]);

  return null;
}
