import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authorizedFetch } from '../services/backend';
import { useProfile } from './ProfileContext';

export type AlertContextValue = {
  unhandledCount: number;
  refreshAlertCount: () => void;
};

const AlertContext = createContext<AlertContextValue>({
  unhandledCount: 0,
  refreshAlertCount: () => {},
});

const HANDLED_STATUSES = new Set(['acknowledged', 'resolved']);

type AlertRow = {
  id: string;
  processed?: boolean;
  status?: string | null;
  risk_level?: string | null;
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

function isCriticalAlert(alert: AlertRow) {
  return alert.risk_level?.toLowerCase() === 'critical';
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
      // Only count unhandled CRITICAL alerts in the badge
      const count = alerts.filter((alert) => !isHandledAlert(alert) && isCriticalAlert(alert)).length;
      setUnhandledCount(count);
    } catch {
      setUnhandledCount(0);
    }
  }, [activeProfile]);

  useEffect(() => {
    void loadAlerts();
    // Reduced polling interval to 30 seconds for faster updates
    const interval = setInterval(() => {
      void loadAlerts();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  const value = useMemo(
    () => ({
      unhandledCount,
      refreshAlertCount: loadAlerts,
    }),
    [unhandledCount, loadAlerts]
  );

  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>;
}

export function useAlertContext() {
  return useContext(AlertContext);
}
