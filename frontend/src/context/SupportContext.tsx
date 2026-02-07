import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authorizedFetch } from '../services/backend';
import { useProfile } from './ProfileContext';

type SupportContextValue = {
  unreadAgentCount: number;
  refreshUnread: () => Promise<void>;
};

const SupportContext = createContext<SupportContextValue | undefined>(undefined);

export function SupportProvider({ children }: { children: ReactNode }) {
  const { activeProfile } = useProfile();
  const [unreadAgentCount, setUnreadAgentCount] = useState(0);

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

  useEffect(() => {
    void refreshUnread();
    const interval = setInterval(() => {
      void refreshUnread();
    }, 30_000);
    return () => clearInterval(interval);
  }, [refreshUnread]);

  const contextValue = useMemo(
    () => ({ unreadAgentCount, refreshUnread }),
    [unreadAgentCount, refreshUnread]
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
