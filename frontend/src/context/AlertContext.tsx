import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authorizedFetch } from '../services/backend';
import { CIRCLE_ALERT_TYPES } from '../screens/dashboard/circleActivityConstants';
import { updateWidgetSnapshot, clearWidgetSnapshot } from '../native/WidgetSnapshot';
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
  risk_label?: string | null;
  feedback_status?: string | null;
  alert_type?: string | null;
  payload?: {
    score?: number;
    auto?: boolean;
    automation?: boolean;
    system_event?: boolean;
  } | null;
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

const HIGH_RISK_LEVELS = new Set(['critical', 'high', 'medium']);

function isCircleAlert(alert: AlertRow) {
  return CIRCLE_ALERT_TYPES.has(alert.alert_type ?? '');
}

function isTrustedAlert(alert: AlertRow) {
  return (alert.alert_type ?? '').toLowerCase() === 'trusted';
}

function isPriorityAlert(alert: AlertRow) {
  const riskLevel = (alert.risk_level ?? '').toLowerCase();
  return (
    !isCircleAlert(alert) &&
    !isHandledAlert(alert) &&
    !isTrustedAlert(alert) &&
    (HIGH_RISK_LEVELS.has(riskLevel) ||
      (typeof alert.payload?.score === 'number' && alert.payload.score >= 80))
  );
}

function isShieldAlert(alert: AlertRow) {
  const safeLabel = (alert.risk_label ?? '').toLowerCase() === 'safe';
  return (
    !isCircleAlert(alert) &&
    (alert.processed || alert.feedback_status === 'marked_safe') &&
    (safeLabel || alert.feedback_status === 'marked_safe' || alert.payload?.auto === true)
  );
}

function isSystemHealthAlert(alert: AlertRow) {
  return (
    !isHandledAlert(alert) &&
    !isCircleAlert(alert) &&
    !isTrustedAlert(alert) &&
    (alert.payload?.auto === true ||
      alert.payload?.automation === true ||
      alert.payload?.system_event === true ||
      alert.status === 'blocked')
  );
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const { activeProfile } = useProfile();
  const [unhandledCount, setUnhandledCount] = useState(0);

  const loadAlerts = useCallback(async () => {
    if (!activeProfile) {
      setUnhandledCount(0);
      void clearWidgetSnapshot().catch(() => null);
      return;
    }
    try {
      const data = await authorizedFetch(
        `/alerts?limit=100&profileId=${encodeURIComponent(activeProfile.id)}`
      );
      const alerts = (data?.alerts ?? []) as AlertRow[];

      // Badge count remains strict: unhandled critical, non-circle, non-trusted.
      const count = alerts.filter(
        (alert) =>
          !isHandledAlert(alert) &&
          !isCircleAlert(alert) &&
          !isTrustedAlert(alert) &&
          isCriticalAlert(alert)
      ).length;
      setUnhandledCount(count);

      const priorityAlerts = alerts.filter((alert) => isPriorityAlert(alert));
      const priorityIds = new Set(priorityAlerts.map((alert) => alert.id));
      const shieldAlerts = alerts.filter((alert) => isShieldAlert(alert));
      const shieldIds = new Set(shieldAlerts.map((alert) => alert.id));
      const systemHealthAlerts = alerts.filter(
        (alert) =>
          isSystemHealthAlert(alert) &&
          !priorityIds.has(alert.id) &&
          !shieldIds.has(alert.id)
      );
      const systemHealthIds = new Set(systemHealthAlerts.map((alert) => alert.id));
      const handledAlerts = alerts.filter(
        (alert) => !isCircleAlert(alert) && isHandledAlert(alert) && !isTrustedAlert(alert)
      );
      const handledIds = new Set(handledAlerts.map((alert) => alert.id));
      const recentNeedsAttention = alerts.filter(
        (alert) =>
          !isCircleAlert(alert) &&
          !isTrustedAlert(alert) &&
          !isHandledAlert(alert) &&
          !priorityIds.has(alert.id) &&
          !shieldIds.has(alert.id) &&
          !systemHealthIds.has(alert.id) &&
          !handledIds.has(alert.id)
      );
      const circleActivity = alerts.filter((alert) => isCircleAlert(alert));

      await updateWidgetSnapshot({
        needsAttentionCount:
          priorityAlerts.length + systemHealthAlerts.length + recentNeedsAttention.length,
        historyCount: handledAlerts.length + circleActivity.length,
        profileId: activeProfile.id,
        lastUpdatedEpochSeconds: Math.floor(Date.now() / 1000),
      });
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
