import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Audio } from 'expo-av';

import { authorizedFetch } from '../services/backend';
import { useProfile } from './ProfileContext';

type SupportContextValue = {
  unreadAgentCount: number;
  assistantOnline: boolean;
  refreshUnread: () => Promise<void>;
  refreshAssistantStatus: () => Promise<void>;
  playNotificationSound: () => Promise<void>;
};

const SupportContext = createContext<SupportContextValue | undefined>(undefined);

export function SupportProvider({ children }: { children: ReactNode }) {
  const { activeProfile } = useProfile();
  const [unreadAgentCount, setUnreadAgentCount] = useState(0);
  const [assistantOnline, setAssistantOnline] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const lastCountRef = useRef(0);
  const hasInitializedRef = useRef(false);

  const refreshUnread = useCallback(async () => {
    if (!activeProfile?.id) {
      setUnreadAgentCount(0);
      return;
    }
    try {
      const data = await authorizedFetch(
        `/profiles/${activeProfile.id}/support/messages/unread-count`
      );
      setUnreadAgentCount(data?.unreadAgentMessages ?? 0);
    } catch (err) {
      console.warn('Failed to refresh support unread count', err);
      setUnreadAgentCount(0);
    }
  }, [activeProfile?.id]);

  const refreshAssistantStatus = useCallback(async () => {
    if (!activeProfile?.id) {
      setAssistantOnline(false);
      return;
    }
    try {
      const data = await authorizedFetch(`/profiles/${activeProfile.id}/support/assistant-status`);
      setAssistantOnline(Boolean(data?.isOnline));
    } catch (err) {
      console.warn('Failed to refresh assistant status', err);
      setAssistantOnline(false);
    }
  }, [activeProfile?.id]);

  const playNotification = useCallback(async () => {
    try {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/support-notification.wav'),
          { shouldPlay: false }
        );
        soundRef.current = sound;
      }
      await soundRef.current.replayAsync();
    } catch (err) {
      console.warn('Failed to play support notification', err);
    }
  }, []);

  useEffect(() => {
    void refreshUnread();
    void refreshAssistantStatus();
    const interval = setInterval(() => {
      void refreshUnread();
      void refreshAssistantStatus();
    }, 30_000);
    return () => clearInterval(interval);
  }, [refreshUnread, refreshAssistantStatus]);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      lastCountRef.current = unreadAgentCount;
      return;
    }
    if (unreadAgentCount > lastCountRef.current) {
      lastCountRef.current = unreadAgentCount;
      void playNotification();
    } else {
      lastCountRef.current = unreadAgentCount;
    }
  }, [playNotification, unreadAgentCount]);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      unreadAgentCount,
      assistantOnline,
      refreshUnread,
      refreshAssistantStatus,
      playNotificationSound: playNotification,
    }),
    [assistantOnline, refreshAssistantStatus, refreshUnread, unreadAgentCount, playNotification]
  );

  return <SupportContext.Provider value={contextValue}>{children}</SupportContext.Provider>;
}

export function useSupportContext() {
  const context = useContext(SupportContext);
  if (!context) {
    throw new Error('useSupportContext must be used inside SupportProvider');
  }
  return context;
}
