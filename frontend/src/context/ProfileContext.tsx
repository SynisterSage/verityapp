import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from './AuthContext';
import { authorizedFetch } from '../services/backend';
import { supabase } from '../services/supabase';
import {
  requestTwilioClientToken,
  sendTwilioClientHeartbeat,
} from '../services/twilioClient';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { registerProfileDeviceToken } from '../services/notifications';
import { logError, logEvent } from '../services/sentry';
import { initializeVoIPPush, updateVoIPPushToken } from '../services/voipPush';
import { setPlaceholderCallUUID, markPlaceholderCallAnswered } from '../services/voipPlaceholderCall';
import { clearIncomingCallMetadata, rememberIncomingCallMetadata } from '../services/incomingCallMetadata';
import { endLiveCallActivity } from '../native/LiveCallActivity';
import type { VoIPPushPayload } from '../types/voip-push';
import { navigateToActiveCall } from '../navigation/rootNavigator';

const ENABLE_CUSTOM_VOIP_PUSH = process.env.EXPO_PUBLIC_ENABLE_CUSTOM_VOIP_PUSH === 'true';
const EXPO_PUSH_BASE_URL = 'https://exp.host/--/api/v2/';
// We manage push token registration ourselves via backend APIs.
// Disable Expo's automatic token updater to avoid noisy appId:null dev warnings.
try {
  const disableAutoRegistration = (Notifications as any).setAutoServerRegistrationEnabledAsync;
  if (typeof disableAutoRegistration === 'function') {
    void Promise.resolve(disableAutoRegistration(false)).catch((err) => {
      console.warn('[push] Failed to disable Expo auto registration', err);
    });
  }
} catch (err) {
  console.warn('[push] Failed to disable Expo auto registration', err);
}

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  fallback_phone_number?: string | null;
  twilio_virtual_number: string | null;
  has_passcode?: boolean | null;
  safety_pin?: string | null;
  alert_threshold_score?: number | null;
  enable_email_alerts?: boolean | null;
  enable_sms_alerts?: boolean | null;
  enable_push_alerts?: boolean | null;
  enable_push_trusted_activity?: boolean | null;
  enable_push_circle_activity?: boolean | null;
  enable_push_support_replies?: boolean | null;
  enable_email_weekly_reports?: boolean | null;
  auto_mark_enabled?: boolean | null;
  auto_mark_fraud_threshold?: number | null;
  auto_mark_safe_threshold?: number | null;
  auto_trust_on_safe?: boolean | null;
  auto_block_on_fraud?: boolean | null;
  completed_safe_phrases?: boolean | null;
  completed_alert_prefs?: boolean | null;
  completed_test_call?: boolean | null;
  dismissed_nudge_cards?: string[] | null;
  created_at: string;
  last_pin_update?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
};

export type ProfileMembership = {
  id: string;
  profile_id: string;
  user_id: string;
  role: 'admin' | 'editor';
  is_caretaker?: boolean;
};

type ProfileContextValue = {
  profiles: Profile[];
  activeProfile: Profile | null;
  activeMembership: ProfileMembership | null;
  canManageProfile: boolean;
  isCaretaker: boolean;
  isAdmin: boolean;
  canDeleteProfile: boolean;
  onboardingComplete: boolean;
  isLoading: boolean;
  resolvedSessionKey: string;
  authInvalid: boolean;
  passcodeDraft: string;
  redirectToSettings: boolean;
  refreshProfiles: (options?: { silent?: boolean }) => Promise<void>;
  setActiveProfile: (profile: Profile | null) => void;
  setOnboardingComplete: (value: boolean) => void;
  setPasscodeDraft: (value: string) => void;
  setRedirectToSettings: (value: boolean) => void;
  twilioClientToken: string | null;
  twilioClientIdentity: string | null;
  twilioClientError: string | null;
  twilioClientHeartbeatActive: boolean;
  isTwilioClientReady: boolean;
  refreshTwilioClientSession: (options?: { force?: boolean }) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [activeMembership, setActiveMembership] = useState<ProfileMembership | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedSessionKey, setResolvedSessionKey] = useState('__boot__');
  const [authInvalid, setAuthInvalid] = useState(false);
  const [passcodeDraft, setPasscodeDraft] = useState('');
  const [redirectToSettings, setRedirectToSettings] = useState(false);
  const [twilioClientToken, setTwilioClientToken] = useState<string | null>(null);
  const [twilioClientIdentity, setTwilioClientIdentity] = useState<string | null>(null);
  const [twilioClientError, setTwilioClientError] = useState<string | null>(null);
  const [twilioClientHeartbeatActive, setTwilioClientHeartbeatActive] = useState(false);
  const isCaretaker = Boolean(activeMembership?.is_caretaker);
  const isAdmin = !isCaretaker && activeMembership?.role === 'admin';
  const canManageProfile = useMemo(() => isCaretaker || isAdmin, [isCaretaker, isAdmin]);
  const canDeleteProfile = isCaretaker;
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastTokenRefreshAtRef = useRef(0);
  const pushRegistrationRef = useRef<{ profileId: string; token: string } | null>(null);
  const isRegisteringPushRef = useRef(false);
  const voipPushCleanupRef = useRef<(() => void) | null>(null);
  const voipTokenRef = useRef<string | null>(null);
  const syncedVoipTokenRef = useRef<string | null>(null);
  const voipTokenSyncInFlightRef = useRef<Promise<void> | null>(null);
  const pendingVoipRefreshRef = useRef(false);
  const skipTwilioDelayRef = useRef(false);
  // Stable refs so refreshProfiles can read latest session/signOut/activeProfileId
  // without closing over them as useCallback dependencies. This prevents two problems:
  //   1. refreshProfiles had activeProfile as dep → setActiveProfile → new ref →
  //      useEffect re-fires → infinite loop (fixed in prior step via activeProfileIdRef).
  //   2. refreshProfiles had session as dep → every TOKEN_REFRESHED event creates a new
  //      session object → new refreshProfiles ref → useEffect re-fires → re-fetches
  //      /profiles and resets activeProfile → all settings screen useEffect([activeProfile])
  //      fire and reset form state while the user is typing.
  const activeProfileIdRef = useRef<string | null>(null);
  const sessionRef = useRef(session);
  const signOutRef = useRef(signOut);
  useEffect(() => { activeProfileIdRef.current = activeProfile?.id ?? null; }, [activeProfile]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { signOutRef.current = signOut; }, [signOut]);

  // Fully stable — deps are read from refs so the function reference never changes.
  const refreshProfiles = useCallback(async (options?: { silent?: boolean }) => {
    const currentSession = sessionRef.current;
    const currentSignOut = signOutRef.current;
    const targetSessionKey = currentSession?.user?.id ?? '__anon__';
    if (!options?.silent) {
      setIsLoading(true);
    }
    if (!currentSession) {
      setProfiles([]);
      setActiveProfile(null);
      setActiveMembership(null);
      setAuthInvalid(false);
      setIsLoading(false);
      setResolvedSessionKey(targetSessionKey);
      return;
    }
    try {
      const data = await authorizedFetch('/profiles');
      const list = (data?.profiles ?? []) as Profile[];
      const currentId = activeProfileIdRef.current;
      const selectedProfile =
        (currentId ? list.find((profile) => profile.id === currentId) : null) ??
        list[0] ??
        null;
      setProfiles(list);
      setActiveProfile(selectedProfile);
      setOnboardingComplete(Boolean(selectedProfile?.has_passcode));
      setAuthInvalid(false);
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (message.includes('401') || message.includes('unauthorized')) {
        await currentSignOut();
        setAuthInvalid(true);
        setProfiles([]);
        setActiveProfile(null);
        setOnboardingComplete(false);
        setActiveMembership(null);
      } else {
        // Keep the current profile snapshot on transient failures to avoid UI flicker.
        console.warn('Failed to refresh profiles; keeping previous profile state', err);
      }
    } finally {
      setIsLoading(false);
      setResolvedSessionKey(targetSessionKey);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally reads from refs

  // Only re-run when the signed-in user changes (sign in / sign out).
  // Token refreshes emit a new session object but keep the same user ID —
  // watching user ID prevents unnecessary /profiles fetches and form resets.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    refreshProfiles();
  }, [userId, refreshProfiles]);

  const refreshTwilioClientToken = useCallback(
    async (profileId: string, options?: { force?: boolean }) => {
    const MIN_REFRESH_INTERVAL_MS = 45_000;
    const now = Date.now();
    if (!options?.force && now - lastTokenRefreshAtRef.current < MIN_REFRESH_INTERVAL_MS) {
      return;
    }
    if (tokenRefreshInFlightRef.current) {
      return tokenRefreshInFlightRef.current;
    }

    const runRefresh = (async () => {
    try {
      console.info('[twilio-client] token refresh start', { profileId });
      setTwilioClientError(null);
      const data = await requestTwilioClientToken(profileId);
      console.info('[twilio-client] token refresh success', {
        profileId,
        hasToken: Boolean(data?.token),
        identity: data?.identity ?? null,
      });
      setTwilioClientToken(data.token);
      setTwilioClientIdentity(data.identity);
      if (isCaretaker) {
        try {
          await sendTwilioClientHeartbeat(profileId, data.identity);
          console.info('[twilio-client] heartbeat success', {
            profileId,
            identity: data.identity,
          });
          setTwilioClientHeartbeatActive(true);
        } catch (heartbeatError) {
          console.warn('[twilio-client] heartbeat skipped', {
            profileId,
            message:
              heartbeatError instanceof Error
                ? heartbeatError.message
                : String(heartbeatError),
          });
          setTwilioClientHeartbeatActive(false);
        }
      } else {
        setTwilioClientHeartbeatActive(false);
      }
      lastTokenRefreshAtRef.current = Date.now();
    } catch (err) {
      console.warn('[twilio-client] token refresh failed', {
        profileId,
        message: err instanceof Error ? err.message : String(err),
      });
      // Keep last known-good token/identity on transient failures to prevent client flapping.
      setTwilioClientHeartbeatActive(false);
      const message = err instanceof Error ? err.message : 'Failed to fetch Twilio client token';
      setTwilioClientError(message);
      throw err;
    }
    })();

    tokenRefreshInFlightRef.current = runRefresh;
    try {
      await runRefresh;
    } finally {
      tokenRefreshInFlightRef.current = null;
    }
    },
    [isCaretaker]
  );

  const refreshTwilioClientSession = useCallback(async (options?: { force?: boolean }) => {
    if (!activeProfile?.id) {
      return;
    }
    await refreshTwilioClientToken(activeProfile.id, options);
  }, [activeProfile?.id, refreshTwilioClientToken]);

  const syncVoipTokenToBackend = useCallback(async () => {
    if (!session || !activeProfile?.id || !voipTokenRef.current) {
      return;
    }

    const token = voipTokenRef.current;
    const syncKey = `${activeProfile.id}:${token}`;
    if (syncedVoipTokenRef.current === syncKey) {
      return;
    }

    if (voipTokenSyncInFlightRef.current) {
      await voipTokenSyncInFlightRef.current;
      return;
    }

    const runSync = (async () => {
      await updateVoIPPushToken(activeProfile.id, token);
      syncedVoipTokenRef.current = syncKey;
    })();

    voipTokenSyncInFlightRef.current = runSync;
    try {
      await runSync;
    } finally {
      voipTokenSyncInFlightRef.current = null;
    }
  }, [activeProfile?.id, session]);

  useEffect(() => {
    if (!session || !activeProfile?.id) {
      setActiveMembership(null);
      return;
    }
    const loadMembership = async () => {
      const userId = session.user?.id;
      if (!userId) {
        setActiveMembership(null);
        return;
      }
      try {
        const data = await authorizedFetch(`/profiles/${activeProfile.id}/members`);
        const memberList = (data?.members ?? []) as ProfileMembership[];
        const membership = memberList.find((member) => member.user_id === userId) ?? null;
        setActiveMembership(membership);
      } catch (err) {
        console.warn('Failed to refresh membership', err);
        setActiveMembership(null);
      }
    };
    loadMembership();
  }, [session, activeProfile?.id]);

  const registerPushTokenForProfile = useCallback(async () => {
    if (!session || !activeProfile?.id) {
      return;
    }
    if (isRegisteringPushRef.current) {
      return;
    }
    try {
      isRegisteringPushRef.current = true;
      console.info('[push] register start', { profileId: activeProfile.id, platform: Platform.OS });
      const { status: initialStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = initialStatus;
      if (initialStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      console.info('[push] permission status', { initialStatus, finalStatus });
      if (finalStatus !== 'granted') {
        logEvent('push_permission_denied', {
          level: 'warning',
          screen: 'ProfileContext',
          extra: { initialStatus, finalStatus },
        });
        return;
      }
      const expoProjectId =
        process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ||
        Constants.expoConfig?.extra?.eas?.projectId ||
        (Constants as any).easConfig?.projectId;
      const nativeApplicationId = Application.applicationId;
      const configApplicationId = Constants.expoConfig?.ios?.bundleIdentifier;
      const envApplicationId = process.env.EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER;
      // Final hard fallback keeps local dev builds moving even when expo-application can't infer app id.
      const defaultIosApplicationId = Platform.OS === 'ios' ? 'com.lexferguson.verityprotect.com' : undefined;
      const applicationId =
        nativeApplicationId || configApplicationId || envApplicationId || defaultIosApplicationId;
      console.info('[push] project id resolved', { hasProjectId: Boolean(expoProjectId) });
      console.info('[push] application id source', {
        hasNativeApplicationId: Boolean(nativeApplicationId),
        hasConfigApplicationId: Boolean(configApplicationId),
        hasEnvApplicationId: Boolean(envApplicationId),
        hasDefaultIosApplicationId: Boolean(defaultIosApplicationId),
      });
      if (!expoProjectId) {
        logEvent('push_token_error', {
          level: 'warning',
          screen: 'ProfileContext',
          extra: { reason: 'missing_project_id' },
        });
        console.warn(
          'Expo projectId is missing; set EXPO_PUBLIC_EXPO_PROJECT_ID to enable Expo push token registration.'
        );
        return;
      }
      if (!applicationId) {
        logEvent('push_token_error', {
          level: 'warning',
          screen: 'ProfileContext',
          extra: { reason: 'missing_application_id' },
        });
        console.warn(
          'Expo applicationId is missing; set EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER to enable Expo push token registration.'
        );
        return;
      }
      console.info('[push] application id resolved', { applicationId });
      const tokenResult = await Notifications.getExpoPushTokenAsync({
        projectId: expoProjectId,
        applicationId: String(applicationId),
        // Passing an explicit base URL avoids expo-notifications auto-registration,
        // which can emit noisy appId:null warnings in some dev-client builds.
        baseUrl: EXPO_PUSH_BASE_URL,
      });
      const pushToken = tokenResult?.data;
      console.info('[push] token generated', {
        hasToken: Boolean(pushToken),
        tokenPreview: pushToken ? `${pushToken.slice(0, 14)}...` : null,
      });
      if (!pushToken) {
        logEvent('push_token_error', {
          level: 'warning',
          screen: 'ProfileContext',
          extra: { reason: 'missing_token' },
        });
        return;
      }
      const alreadyRegistered = pushRegistrationRef.current;
      if (alreadyRegistered?.profileId === activeProfile.id && alreadyRegistered.token === pushToken) {
        return;
      }
      const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
      const metadata = {
        appVersion:
          Constants.expoConfig?.version ??
          (typeof Constants.manifest === 'object' ? Constants.manifest?.version : undefined),
      };
      const registerResult = await registerProfileDeviceToken({
        profileId: activeProfile.id,
        expoPushToken: pushToken,
        platform: Platform.OS,
        locale,
        metadata,
      });
      console.info('[push] backend register success', {
        profileId: activeProfile.id,
        responseKeys: registerResult && typeof registerResult === 'object' ? Object.keys(registerResult) : [],
      });
      pushRegistrationRef.current = { profileId: activeProfile.id, token: pushToken };
    } catch (err) {
      console.warn('Failed to register push token', err);
      console.warn('[push] register failed details', {
        profileId: activeProfile?.id,
        message: err instanceof Error ? err.message : String(err),
      });
      logError(err, {
        screen: 'ProfileContext',
        extra: { reason: 'register_push_token_failed' },
      });
    } finally {
      isRegisteringPushRef.current = false;
    }
  }, [activeProfile?.id, session]);

  useEffect(() => {
    registerPushTokenForProfile();
  }, [registerPushTokenForProfile]);

  // VoIP push registration (iOS only) - ensures calls wake the app from any state
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      if (voipPushCleanupRef.current) {
        voipPushCleanupRef.current();
        voipPushCleanupRef.current = null;
      }
      return;
    }

    if (!ENABLE_CUSTOM_VOIP_PUSH) {
      if (voipPushCleanupRef.current) {
        voipPushCleanupRef.current();
        voipPushCleanupRef.current = null;
      }
      return;
    }

    const handleVoIPToken = async (token: string) => {
      const tokenChanged = voipTokenRef.current !== token;
      voipTokenRef.current = token;
      if (tokenChanged) {
        syncedVoipTokenRef.current = null;
      }

      if (!session || !activeProfile?.id) {
        console.info('[VoIPPush] Token received before profile/session is ready; deferring backend sync');
        return;
      }

      console.info('[VoIPPush] Token received, updating backend');
      try {
        await syncVoipTokenToBackend();
      } catch (error) {
        console.error('[VoIPPush] Failed to update token on backend:', error);
        logError(error, {
          screen: 'ProfileContext',
          extra: { reason: 'voip_token_update_failed' },
        });
      }
    };

    const handleIncomingCall = async (payload: VoIPPushPayload) => {
      console.info('[VoIPPush] Incoming call from push:', payload);
      rememberIncomingCallMetadata({
        callSid: payload.callSid,
        callerName: payload.callerName ?? null,
        fromNumber: payload.fromNumber ?? null,
      });

      // VoIP push module has already created the CallKit call (required by iOS)
      // Store the UUID so we can end it when Twilio's real call arrives
      if (payload.callUUID) {
        setPlaceholderCallUUID(payload.callUUID);
      }

      // Skip the startup delay for Twilio initialization
      skipTwilioDelayRef.current = true;
      pendingVoipRefreshRef.current = true;

      // IMMEDIATELY refresh Twilio session - this is critical for calls when app is closed/background
      if (session && activeProfile?.id) {
        try {
          console.info('[VoIPPush] Immediately refreshing Twilio session for incoming call');
          await refreshTwilioClientSession({ force: true });
          pendingVoipRefreshRef.current = false;
        } catch (error) {
          console.warn('[VoIPPush] Immediate Twilio refresh failed; will retry when profile is ready', error);
        }
      } else {
        console.info('[VoIPPush] Incoming call arrived before profile/session was ready; queued refresh');
      }

      // DO NOT navigate here - let Twilio SDK handle the call flow
      // The Twilio SDK will automatically handle CallKit and navigation when the actual call arrives

      logEvent('voip_push_received', {
        level: 'info',
        screen: 'ProfileContext',
        extra: {
          hasCallSid: Boolean(payload.callSid),
          hasFromNumber: Boolean(payload.fromNumber),
        },
      });
    };

    const handleCallAnswered = (callUUID: string) => {
      console.info('[VoIPPush] Call answered:', callUUID);
      // Placeholder CallKit answer should map to accepting the next Twilio invite.
      markPlaceholderCallAnswered(callUUID);
    };

    const handleCallEnded = (payload: { callUUID: string; callSid?: string; source?: string }) => {
      console.info('[VoIPPush] Call ended:', payload.callUUID, {
        callSid: payload.callSid ?? null,
        source: payload.source ?? null,
      });
      if (payload.source === 'placeholder_handoff') {
        return;
      }
      if (payload.callSid) {
        clearIncomingCallMetadata(payload.callSid);
      }
      // Ensure stale lock-screen live activity is terminated even when this
      // end event is replayed before TwilioVoiceClientManager listeners attach.
      void endLiveCallActivity({
        callSid: payload.callSid,
        status: 'Ended',
        label: 'Protected Call',
        callerName: 'Incoming Call',
        isTrusted: false,
        connectedAtEpochSeconds: null,
      }).catch((error) => {
        console.warn('[VoIPPush] Failed to end live activity from call end event', {
          callUUID: payload.callUUID,
          callSid: payload.callSid ?? null,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    };

    const cleanup = initializeVoIPPush({
      onTokenUpdate: handleVoIPToken,
      onIncomingCall: handleIncomingCall,
      onCallAnswered: handleCallAnswered,
      onCallEnded: handleCallEnded,
    });
    voipPushCleanupRef.current = cleanup;

    return () => {
      if (voipPushCleanupRef.current) {
        voipPushCleanupRef.current();
        voipPushCleanupRef.current = null;
      }
    };
  }, [activeProfile?.id, refreshTwilioClientSession, session, syncVoipTokenToBackend]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !ENABLE_CUSTOM_VOIP_PUSH) {
      return;
    }

    if (!session || !activeProfile?.id) {
      return;
    }

    syncVoipTokenToBackend().catch((error) => {
      console.error('[VoIPPush] Deferred token sync failed:', error);
      logError(error, {
        screen: 'ProfileContext',
        extra: { reason: 'voip_token_sync_deferred_failed' },
      });
    });
  }, [activeProfile?.id, session, syncVoipTokenToBackend]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !ENABLE_CUSTOM_VOIP_PUSH) {
      return;
    }

    if (!session || !activeProfile?.id || !pendingVoipRefreshRef.current) {
      return;
    }

    refreshTwilioClientSession({ force: true })
      .then(() => {
        pendingVoipRefreshRef.current = false;
      })
      .catch((error) => {
        console.warn('[VoIPPush] Deferred Twilio refresh failed:', error);
      });
  }, [activeProfile?.id, refreshTwilioClientSession, session]);

  useEffect(() => {
    if (!activeProfile?.id) {
      return;
    }
    const channel = supabase
      .channel(`profile-${activeProfile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${activeProfile.id}`,
        },
        () => {
          void refreshProfiles({ silent: true });
        }
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [activeProfile?.id, refreshProfiles]);

  useEffect(() => {
    setTwilioClientToken(null);
    setTwilioClientIdentity(null);
    setTwilioClientError(null);
    setTwilioClientHeartbeatActive(false);
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (!activeProfile?.id) {
      return;
    }
    let cancelled = false;

    // Always initialize Twilio client token immediately to improve incoming-call
    // reliability during cold start and CallKit answer handoff.
    skipTwilioDelayRef.current = false;
    const delay = 0;

    const timer = setTimeout(() => {
      if (cancelled) return;
      (async () => {
        try {
          await refreshTwilioClientToken(activeProfile.id);
        } catch (err) {
          if (!cancelled) {
            console.warn('Failed to refresh Twilio client token', err);
          }
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [activeProfile?.id, refreshTwilioClientToken]);

  useEffect(() => {
    if (!activeProfile?.id || !twilioClientIdentity || !isCaretaker) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      setTwilioClientHeartbeatActive(false);
      return;
    }
    const sendHeartbeat = () => {
      sendTwilioClientHeartbeat(activeProfile.id, twilioClientIdentity).catch((err) => {
        console.warn('Twilio client heartbeat failed', err);
        setTwilioClientHeartbeatActive(false);
      });
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 45_000);
    heartbeatRef.current = interval;
    setTwilioClientHeartbeatActive(true);
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [activeProfile?.id, isCaretaker, twilioClientIdentity]);

  const isTwilioClientReady = Boolean(twilioClientToken && twilioClientIdentity);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profiles,
      activeProfile,
      activeMembership,
      canManageProfile,
      isCaretaker,
      isAdmin,
      canDeleteProfile,
      onboardingComplete,
      isLoading,
      resolvedSessionKey,
      authInvalid,
      passcodeDraft,
      redirectToSettings,
      refreshProfiles,
      setActiveProfile,
      setOnboardingComplete,
      setPasscodeDraft,
      setRedirectToSettings,
      twilioClientToken,
      twilioClientIdentity,
      twilioClientError,
      twilioClientHeartbeatActive,
      isTwilioClientReady,
      refreshTwilioClientSession,
    }),
    [
      profiles,
      activeProfile,
      activeMembership,
      canManageProfile,
      onboardingComplete,
      isLoading,
      resolvedSessionKey,
      authInvalid,
      refreshProfiles,
      passcodeDraft,
      redirectToSettings,
      twilioClientToken,
      twilioClientIdentity,
      twilioClientError,
      twilioClientHeartbeatActive,
      isTwilioClientReady,
      refreshTwilioClientSession,
    ]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return ctx;
}
