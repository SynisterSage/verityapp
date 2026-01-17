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

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  twilio_virtual_number: string | null;
  has_passcode?: boolean | null;
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
  const [isLoading, setIsLoading] = useState(false);
  const [authInvalid, setAuthInvalid] = useState(false);
  const [passcodeDraft, setPasscodeDraft] = useState('');
  const [redirectToSettings, setRedirectToSettings] = useState(false);
  const [twilioClientToken, setTwilioClientToken] = useState<string | null>(null);
  const [twilioClientIdentity, setTwilioClientIdentity] = useState<string | null>(null);
  const [twilioClientError, setTwilioClientError] = useState<string | null>(null);
  const [twilioClientHeartbeatActive, setTwilioClientHeartbeatActive] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshProfiles = useCallback(async () => {
    if (!session) {
      setProfiles([]);
      setActiveProfile(null);
      setActiveMembership(null);
      setAuthInvalid(false);
      return;
    }
    setIsLoading(true);
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
      setTwilioClientError(null);
      const data = await requestTwilioClientToken(profileId);
      setTwilioClientToken(data.token);
      setTwilioClientIdentity(data.identity);
      await sendTwilioClientHeartbeat(profileId, data.identity);
      setTwilioClientHeartbeatActive(true);
    } catch (err) {
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

  const canManageProfile = useMemo(
    () => Boolean(activeMembership?.is_caretaker || activeMembership?.role === 'admin'),
    [activeMembership]
  );

  const isTwilioClientReady = Boolean(twilioClientToken && twilioClientIdentity);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profiles,
      activeProfile,
      activeMembership,
      canManageProfile,
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
