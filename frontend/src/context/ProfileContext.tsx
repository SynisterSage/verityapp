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

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  twilio_virtual_number: string | null;
  has_passcode?: boolean | null;
  safety_pin?: string | null;
  alert_threshold_score?: number | null;
  enable_email_alerts?: boolean | null;
  enable_sms_alerts?: boolean | null;
  enable_push_alerts?: boolean | null;
  auto_mark_enabled?: boolean | null;
  auto_mark_fraud_threshold?: number | null;
  auto_mark_safe_threshold?: number | null;
  auto_trust_on_safe?: boolean | null;
  auto_block_on_fraud?: boolean | null;
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
  authInvalid: boolean;
  passcodeDraft: string;
  redirectToSettings: boolean;
  refreshProfiles: () => Promise<void>;
  setActiveProfile: (profile: Profile | null) => void;
  setOnboardingComplete: (value: boolean) => void;
  setPasscodeDraft: (value: string) => void;
  setRedirectToSettings: (value: boolean) => void;
  twilioClientToken: string | null;
  twilioClientIdentity: string | null;
  twilioClientError: string | null;
  twilioClientHeartbeatActive: boolean;
  isTwilioClientReady: boolean;
  refreshTwilioClientSession: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [activeMembership, setActiveMembership] = useState<ProfileMembership | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authInvalid, setAuthInvalid] = useState(false);
  const [passcodeDraft, setPasscodeDraft] = useState('');
  const [redirectToSettings, setRedirectToSettings] = useState(false);
  const [twilioClientToken, setTwilioClientToken] = useState<string | null>(null);
  const [twilioClientIdentity, setTwilioClientIdentity] = useState<string | null>(null);
  const [twilioClientError, setTwilioClientError] = useState<string | null>(null);
  const [twilioClientHeartbeatActive, setTwilioClientHeartbeatActive] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pushRegistrationRef = useRef<{ profileId: string; token: string } | null>(null);
  const isRegisteringPushRef = useRef(false);

  const refreshProfiles = useCallback(async () => {
    setIsLoading(true);
    if (!session) {
      setProfiles([]);
      setActiveProfile(null);
      setActiveMembership(null);
      setAuthInvalid(false);
      setIsLoading(false);
      return;
    }
    try {
      const data = await authorizedFetch('/profiles');
      const list = (data?.profiles ?? []) as Profile[];
      setProfiles(list);
      setActiveProfile(list[0] ?? null);
      setOnboardingComplete(Boolean(list[0]?.has_passcode));
      setAuthInvalid(false);
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (message.includes('401') || message.includes('unauthorized')) {
        await signOut();
        setAuthInvalid(true);
      }
      setProfiles([]);
      setActiveProfile(null);
      setOnboardingComplete(false);
      setActiveMembership(null);
   } finally {
     setIsLoading(false);
   }
  }, [session, signOut]);

  useEffect(() => {
    refreshProfiles();
  }, [session, refreshProfiles]);

  const refreshTwilioClientToken = useCallback(async (profileId: string) => {
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
      await sendTwilioClientHeartbeat(profileId, data.identity);
      console.info('[twilio-client] heartbeat success', {
        profileId,
        identity: data.identity,
      });
      setTwilioClientHeartbeatActive(true);
    } catch (err) {
      console.warn('[twilio-client] token refresh failed', {
        profileId,
        message: err instanceof Error ? err.message : String(err),
      });
      setTwilioClientToken(null);
      setTwilioClientIdentity(null);
      setTwilioClientHeartbeatActive(false);
      const message = err instanceof Error ? err.message : 'Failed to fetch Twilio client token';
      setTwilioClientError(message);
      throw err;
    }
  }, []);

  const refreshTwilioClientSession = useCallback(async () => {
    if (!activeProfile?.id) {
      return;
    }
    await refreshTwilioClientToken(activeProfile.id);
  }, [activeProfile?.id, refreshTwilioClientToken]);

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
    if (activeProfile.enable_push_alerts === false) {
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
  }, [activeProfile?.enable_push_alerts, activeProfile?.id, session]);

  useEffect(() => {
    registerPushTokenForProfile();
  }, [registerPushTokenForProfile]);

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
          refreshProfiles();
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
    (async () => {
      try {
        await refreshTwilioClientToken(activeProfile.id);
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to refresh Twilio client token', err);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [activeProfile?.id, refreshTwilioClientToken]);

  useEffect(() => {
    if (!activeProfile?.id || !twilioClientIdentity) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      setTwilioClientHeartbeatActive(false);
      return;
    }
    const interval = setInterval(() => {
      sendTwilioClientHeartbeat(activeProfile.id, twilioClientIdentity).catch((err) => {
        console.warn('Twilio client heartbeat failed', err);
        setTwilioClientHeartbeatActive(false);
      });
    }, 45_000);
    heartbeatRef.current = interval;
    setTwilioClientHeartbeatActive(true);
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [activeProfile?.id, twilioClientIdentity]);

  const isCaretaker = Boolean(activeMembership?.is_caretaker);
  const isAdmin = !isCaretaker && activeMembership?.role === 'admin';
  const canManageProfile = useMemo(() => isCaretaker || isAdmin, [isCaretaker, isAdmin]);
  const canDeleteProfile = isCaretaker;

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
