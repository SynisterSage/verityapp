import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authorizedFetch } from '../services/backend';
import { useProfile } from './ProfileContext';

export type AlertContextValue = {
  unhandledCount: number;
};

const AlertContext = createContext<AlertContextValue>({ unhandledCount: 0 });

const HANDLED_STATUSES = new Set(['acknowledged', 'resolved']);

type AlertRow = {
  id: string;
  processed?: boolean;
  status?: string | null;
};

function isHandledByStatus(status?: string | null) {
  if (!status) {
    return false;
  }
  return HANDLED_STATUSES.has(status.toLowerCase());
}

function isHandledAlert(alert: AlertRow) {
  return alert.processed || isHandledByStatus(alert.status);
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const { activeProfile } = useProfile();
  const [unhandledCount, setUnhandledCount] = useState(0);

  const loadAlerts = useCallback(async () => {
    if (!activeProfile) {
      setUnhandledCount(0);
      return;
    }
    try {
      const data = await authorizedFetch('/alerts?limit=50');
      const alerts = (data?.alerts ?? []) as AlertRow[];
      const count = alerts.filter((alert) => !isHandledAlert(alert)).length;
      setUnhandledCount(count);
    } catch {
      setUnhandledCount(0);
    }
  }, [activeProfile]);

  useEffect(() => {
    void loadAlerts();
    const interval = setInterval(() => {
      void loadAlerts();
    }, 60_000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  const value = useMemo(() => ({ unhandledCount }), [unhandledCount]);

  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>;
}

export function useAlertContext() {
  return useContext(AlertContext);
}
