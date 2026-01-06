import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from './AuthContext';
import { authorizedFetch } from '../services/backend';

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
  created_at: string;
};

type ProfileContextValue = {
  profiles: Profile[];
  activeProfile: Profile | null;
  onboardingComplete: boolean;
  isLoading: boolean;
  refreshProfiles: () => Promise<void>;
  setActiveProfile: (profile: Profile | null) => void;
  setOnboardingComplete: (value: boolean) => void;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const refreshProfiles = async () => {
    if (!session) {
      setProfiles([]);
      setActiveProfile(null);
      return;
    }
    setIsLoading(true);
    try {
      const data = await authorizedFetch('/profiles');
      const list = (data?.profiles ?? []) as Profile[];
      setProfiles(list);
      setActiveProfile(list[0] ?? null);
      setOnboardingComplete(Boolean(list[0]?.has_passcode));
    } catch {
      setProfiles([]);
      setActiveProfile(null);
      setOnboardingComplete(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProfiles();
  }, [session]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profiles,
      activeProfile,
      onboardingComplete,
      isLoading,
      refreshProfiles,
      setActiveProfile,
      setOnboardingComplete,
    }),
    [profiles, activeProfile, onboardingComplete, isLoading]
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
