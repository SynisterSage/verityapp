import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Easing,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { authorizedFetch } from '../../services/backend';
import AlertCard from '../../components/alerts/AlertCard';
import EmptyState from '../../components/common/EmptyState';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import { useAlertContext } from '../../context/AlertContext';
import { subscribeToCallUpdates } from '../../utils/callEvents';
import DashboardHeader from '../../components/common/DashboardHeader';
import { withOpacity } from '../../utils/color';
import { getRiskStyles } from '../../utils/risk';
import { formatPhoneNumber } from '../../utils/formatPhoneNumber';
import type { AppTheme } from '../../theme/tokens';
import type { CircleActivityItem } from './circleActivityTypes';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { AlertRow } from './alertTypes';
import { CIRCLE_ALERT_TYPES } from './circleActivityConstants';
import { formatAlertDateLabel, formatAlertTime } from './alertTimeUtils';
import { getCircleTrayCopy, getCircleTrayDisplay } from './circleTrayUtils';
import { logError, logEvent } from '../../services/sentry';
import { useSupportContext } from '../../context/SupportContext';
import { navigateToSupportPortal } from '../../navigation/rootNavigator';
const capitalizeLabel = (value?: string | null) => {
  if (!value) return '';
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const formatDetectedTitle = (fallback: string, label?: string | null) => {
  const capitalized = capitalizeLabel(label);
  return capitalized ? `${capitalized} Detected` : fallback;
};

function formatReason(alert: AlertRow) {
  if (alert.payload?.reason) return alert.payload.reason;
  const keywords = alert.payload?.matchedKeywords as string[] | undefined;
  if (Array.isArray(keywords) && keywords.length > 0) {
    return `Mentioned “${keywords[0]}”`;
  }
  return null;
}

const highRiskLevels = new Set(['critical', 'high', 'medium']);
const HANDLED_STATUSES = new Set(['acknowledged', 'resolved']);

function isHandledByStatus(status?: string | null) {
  if (!status) return false;
  return HANDLED_STATUSES.has(status.toLowerCase());
}

function isHandledAlert(alert: AlertRow) {
  return alert.processed || isHandledByStatus(alert.status);
}

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { activeProfile, canManageProfile } = useProfile();
  const { theme } = useTheme();
  const styles = useMemo(() => createAlertStyles(theme), [theme]);
  const { unreadAgentCount } = useSupportContext();
  const { refreshAlertCount } = useAlertContext();
  const refreshControlProps = useMemo(
    () => ({
      tintColor: theme.colors.accent,
      colors: [theme.colors.accent],
      progressBackgroundColor: theme.colors.bg,
    }),
    [theme.colors.accent, theme.colors.bg]
  );
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [callNumberMap, setCallNumberMap] = useState<Record<string, string>>({});
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const isCircleActivityAlert = useCallback(
    (alert: AlertRow) => CIRCLE_ALERT_TYPES.has(alert.alert_type ?? ''),
    []
  );
  const loadAlertsRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const listRef = useRef<ScrollView>(null);
  const [trayAlert, setTrayAlert] = useState<AlertRow | null>(null);
  const [isTrayMounted, setIsTrayMounted] = useState(false);
  const trayAnim = useRef(new Animated.Value(0)).current;
  const [trayProcessing, setTrayProcessing] = useState(false);
  const topScrimColors = useMemo(
    () =>
      [
        withOpacity(theme.colors.bg, 0.92),
        withOpacity(theme.colors.bg, 0.18),
        withOpacity(theme.colors.bg, 0),
      ] as const,
    [theme.colors.bg]
  );
  const [activeTrayAction, setActiveTrayAction] = useState<'delete' | null>(null);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  const handleSupportPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    navigateToSupportPortal();
  }, []);

  const navigateToCallDetail = useCallback(
    (callId: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate('CallDetailModal', {
        callId,
        compact: true,
      });
    },
    [navigation]
  );

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

const formatRecencyLabel = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const delta = Date.now() - date.getTime();
  if (delta >= ONE_DAY_MS) {
    const days = Math.floor(delta / ONE_DAY_MS);
    return `${days}d`;
  }
  return formatAlertTime(value);
};

const formatHandledTimestampLabel = (value?: string | null) => {
  if (!value) return '';
  const dateLabel = formatAlertDateLabel(value);
  return dateLabel || formatAlertTime(value);
};

const formatTrustedContactName = (name?: string | null, relationship?: string | null) => {
  if (!name) return relationship ? relationship : 'Trusted contact';
  const trimmed = name.trim();
  if (!relationship) return trimmed;
  return `${trimmed} (${relationship})`;
};

const normalizeDigits = (value?: string | null) => (value ? value.replace(/\D/g, '') : '');

const loadContactNames = async () => {
  if (!activeProfile) {
    setContactNames({});
    return;
  }
  let map: Record<string, string> = {};
  const raw = await AsyncStorage.getItem(`trusted_contacts_map:${activeProfile.id}`);
  if (raw) {
    try {
      const parsed = JSON.parse(
        raw
      ) as Record<string, { name?: string; relationship?: string; numbers?: string[] } | string[]>;
      Object.values(parsed).forEach((entry) => {
        if (Array.isArray(entry)) {
          entry.forEach((number) => {
            if (number) {
              map[number] = map[number] ?? 'Trusted contact';
              const normalized = normalizeDigits(number);
              if (normalized) {
                map[normalized] = map[normalized] ?? 'Trusted contact';
              }
            }
          });
        } else if (entry && typeof entry === 'object') {
          const name = entry.name ?? 'Trusted contact';
          const relationship = entry.relationship ?? undefined;
          const displayName = formatTrustedContactName(name, relationship);
          const numbers = Array.isArray(entry.numbers) ? entry.numbers : [];
          numbers.forEach((number) => {
            if (number) {
              map[number] = displayName;
              const normalized = normalizeDigits(number);
              if (normalized) {
                map[normalized] = displayName;
              }
            }
          });
        }
      });
    } catch {
      map = {};
    }
  }
  try {
    const data = await authorizedFetch(`/fraud/trusted-contacts?profileId=${activeProfile.id}`);
    const trusted = data?.trusted_contacts ?? [];
      trusted.forEach((contact: any) => {
        const number = contact.caller_number;
        if (number) {
          const displayName = formatTrustedContactName(contact.contact_name ?? contact.caller_number, contact.relationship_tag);
          map[number] = displayName;
          const normalized = normalizeDigits(number);
          if (normalized) {
            map[normalized] = displayName;
          }
        }
      });
    await AsyncStorage.setItem(`trusted_contacts_map:${activeProfile.id}`, JSON.stringify(map));
  } catch {
    // swallow
  }
  setContactNames(map);
};

const loadMemberNames = useCallback(async () => {
  if (!activeProfile) {
    setMemberNames({});
    return;
  }
  try {
    const data = await authorizedFetch(`/profiles/${activeProfile.id}/members`);
    const members = (data?.members ?? []) as Array<{ user_id?: string; display_name?: string }>;
    const map: Record<string, string> = {};
    members.forEach((member) => {
      if (member.user_id && member.display_name) {
        map[member.user_id] = member.display_name;
      }
    });
    setMemberNames(map);
  } catch {
    setMemberNames({});
  }
}, [activeProfile]);

  const loadAlerts = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      await loadContactNames();
      await loadMemberNames();
      const data = await authorizedFetch('/alerts?limit=100');
      const alerts = (data?.alerts ?? []) as AlertRow[];
      const callIds = alerts
        .map((alert) => alert.call_id)
        .filter((callId): callId is string => Boolean(callId));

      let feedbackMap = new Map<
        string,
        {
          feedback_status?: string | null;
          fraud_risk_level?: string | null;
          feedback_at?: string | null;
          feedback_by_user_id?: string | null;
        }
      >();
      let numberMap: Record<string, string> = {};
      let feedbackUserNames: Record<string, string> = {};
      if (callIds.length > 0) {
        const { data: callRows } = await supabase
          .from('calls')
          .select(
            'id, feedback_status, fraud_risk_level, caller_number, feedback_at, feedback_by_user_id'
          )
          .in('id', callIds);
        const feedbackUserIds = Array.from(
          new Set(
            (callRows ?? [])
              .map((row) => row.feedback_by_user_id)
              .filter((id): id is string => Boolean(id))
          )
        );
        if (feedbackUserIds.length > 0) {
          const { data: userRows } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', feedbackUserIds);
          const nameMap: Record<string, string> = {};
          (userRows ?? []).forEach((row) => {
            const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
            if (fullName) {
              nameMap[row.id] = fullName;
            }
          });
          feedbackUserNames = nameMap;
        }
        feedbackMap = new Map(
          (callRows ?? []).map((row) => [
            row.id,
            {
              feedback_status: row.feedback_status ?? null,
              fraud_risk_level: row.fraud_risk_level ?? null,
              feedback_at: row.feedback_at ?? null,
              feedback_by_user_id: row.feedback_by_user_id ?? null,
            },
          ])
        );
        numberMap = Object.fromEntries(
          (callRows ?? [])
            .filter((row) => row.caller_number)
            .map((row) => [row.id, row.caller_number as string])
        );
      }

      const enriched = alerts.map((alert) => {
        const feedback = alert.call_id ? feedbackMap.get(alert.call_id) : undefined;
        const feedbackStatus = feedback?.feedback_status ?? null;
        const riskLabel =
          feedbackStatus === 'marked_fraud'
            ? 'Fraud'
            : feedbackStatus === 'marked_safe'
            ? 'Safe'
            : alert.payload?.riskLevel ?? 'alert';
        const riskLevel =
          feedbackStatus === 'marked_fraud'
            ? 'critical'
            : feedbackStatus === 'marked_safe'
            ? 'low'
            : feedback?.fraud_risk_level ?? alert.payload?.riskLevel ?? null;
        const handledByName =
          feedback?.feedback_by_user_id && feedbackUserNames[feedback.feedback_by_user_id]
            ? feedbackUserNames[feedback.feedback_by_user_id]
            : null;
        return {
          ...alert,
          risk_label: riskLabel,
          risk_level: riskLevel,
          processed: Boolean(feedbackStatus),
          feedback_status: feedbackStatus,
          feedback_at: feedback?.feedback_at ?? null,
          feedback_by_user_id: feedback?.feedback_by_user_id ?? null,
          handled_by_name: handledByName,
        };
      });

      setAlerts(enriched);
      setCallNumberMap(numberMap);
      // Refresh badge count after loading alerts
      refreshAlertCount();
    } catch {
      setAlerts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  useEffect(() => {
    loadAlertsRef.current = loadAlerts;
  }, [loadAlerts]);

  useEffect(() => {
    const unsubscribe = subscribeToCallUpdates(() => {
      loadAlertsRef.current?.(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const interval = isAppActive
      ? setInterval(() => {
          loadAlerts(true);
        }, 60000)
      : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAppActive]);

  useFocusEffect(
    useCallback(() => {
      loadAlerts(true);
      listRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const skeletonRows = useMemo(() => Array.from({ length: 3 }, (_, i) => `skeleton-${i}`), []);
  const showSkeleton = loading && alerts.length === 0;
  const contentOpacity = showSkeleton ? 0 : 1;
  const accent = theme.colors.accent;
  const sortedAlerts = useMemo(() => {
    const weight = (row: AlertRow) => (row.processed ? 1 : 0);
    return [...alerts].sort((a, b) => {
      const wDiff = weight(a) - weight(b);
      if (wDiff !== 0) return wDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [alerts]);
  const priorityAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const riskLevel = (alert.risk_level ?? '').toLowerCase();
      return (
        !isCircleActivityAlert(alert) &&
        !alert.processed &&
        (highRiskLevels.has(riskLevel) ||
          (typeof alert.payload?.score === 'number' && alert.payload.score >= 80))
      );
    });
  }, [alerts]);
  const shieldAlerts = useMemo(() => {
    return alerts.filter(
      (alert) =>
        !isCircleActivityAlert(alert) &&
        (alert.processed || alert.feedback_status === 'marked_safe') &&
        (alert.risk_label?.toLowerCase() === 'safe' ||
          alert.feedback_status === 'marked_safe' ||
          alert.payload?.auto === true)
    );
  }, [alerts]);
  const priorityIds = new Set(priorityAlerts.map((row) => row.id));
  const shieldIds = new Set(shieldAlerts.map((row) => row.id));
  const filteredAlerts = useMemo(
    () =>
      sortedAlerts.filter(
        (alert) =>
          !priorityIds.has(alert.id) &&
          !shieldIds.has(alert.id) &&
          !isCircleActivityAlert(alert)
      ),
    [sortedAlerts, priorityIds, shieldIds, isCircleActivityAlert]
  );
  const circleActivity = useMemo<CircleActivityItem[]>(() => {
    const now = Date.now();
    const window = 1000 * 60 * 60 * 24; // last 24h
    const cutoff = now - window;

    const processedActivities = alerts
      .filter(
        (alert) =>
          alert.processed && new Date(alert.created_at).getTime() >= cutoff
      )
      .map((alert) => {
        const callerNumber =
          (alert.payload?.callerNumber as string | undefined) ||
          (alert.payload?.caller_number as string | undefined) ||
          (alert.call_id ? callNumberMap[alert.call_id] : undefined);
        const normalizedCaller = normalizeDigits(callerNumber);
        const handlerFallback =
          (normalizedCaller && contactNames[normalizedCaller]) ||
          (callerNumber ? contactNames[callerNumber] : undefined) ||
          formatPhoneNumber(callerNumber) ||
          'Circle member';
        const handlerName =
          memberNames[alert.feedback_by_user_id ?? ''] ??
          alert.handled_by_name ??
          handlerFallback;
        const suspiciousCaller = formatPhoneNumber(
          (alert.payload?.callerNumber as string | undefined) ||
            (alert.payload?.caller_number as string | undefined) ||
            callerNumber
        );
        const actionLabel =
          alert.feedback_status === 'marked_safe' ? 'Marked safe' : 'Flagged as fraud';
        const description = `${actionLabel.toLowerCase()} ${suspiciousCaller ?? 'this caller'}.`;
        const timestamp = formatAlertTime(alert.created_at);
        return {
          id: alert.id,
          label: handlerName,
          description,
          timestamp,
          order: new Date(alert.created_at).getTime(),
          alertRow: alert,
        };
      });

    const circleActivities = alerts
      .filter(
        (alert) =>
          CIRCLE_ALERT_TYPES.has(alert.alert_type ?? '') &&
          new Date(alert.created_at).getTime() >= cutoff
      )
      .map((alert) => {
        const actorId = alert.payload?.actor_user_id as string | undefined;
        const label =
          (actorId && memberNames[actorId]) ??
          alert.payload?.actor_label ??
          'Circle member';
        let description =
          alert.payload?.message ??
          (alert.alert_type === 'circle_invite'
            ? `Shared an invite link${alert.payload?.invite_role ? ` (role: ${alert.payload.invite_role})` : ''}.`
            : alert.alert_type === 'security_password'
            ? 'Updated the account password.'
            : undefined);
        if (!description) {
          if (alert.alert_type === 'safe_phrase_added') {
            description = `Added safe word "${alert.payload?.phrase ?? 'a phrase'}".`;
          } else if (alert.alert_type === 'trusted_contact_added') {
            const count = alert.payload?.added ?? 1;
            description = `Added ${count} trusted contact${count === 1 ? '' : 's'}.`;
          } else if (alert.alert_type === 'blocked_caller_added') {
            description = `Blocked number ${alert.payload?.caller_number ?? 'a caller'}.`;
          } else {
            const memberRoleLabel = alert.payload?.target_role === 'admin' ? 'Caretaker' : 'Family member';
            if (alert.alert_type === 'member_joined') {
              const memberLabel = alert.payload?.member_display_name ?? 'A member';
              description = `${memberLabel} joined the circle.`;
            } else if (alert.alert_type === 'member_role_changed') {
              const targetLabel = alert.payload?.target_display_name ?? 'A member';
              description = `Set ${targetLabel} as ${memberRoleLabel}.`;
            } else if (alert.alert_type === 'member_removed') {
              const targetLabel = alert.payload?.target_display_name ?? 'A member';
              description = `Removed ${targetLabel} from the circle.`;
            } else if (alert.alert_type === 'automation_settings_updated') {
              const fallback =
                Array.isArray(alert.payload?.changes) && alert.payload?.changes.length > 0
                  ? alert.payload?.changes.join(' · ')
                  : undefined;
              description = alert.payload?.message ?? fallback ?? 'Updated automation settings.';
            } else if (alert.alert_type === 'data_exported') {
              description = alert.payload?.message ?? 'Exported the profile data.';
            } else if (alert.alert_type === 'data_cleared') {
              description = alert.payload?.message ?? 'Cleared the call and alert history.';
            } else {
              description = 'Updated the Safety PIN.';
            }
          }
        }
        const timestamp = formatAlertTime(alert.created_at);
        return {
          id: `${alert.id}-circle`,
          label,
          description,
          timestamp,
          order: new Date(alert.created_at).getTime(),
          alertRow: alert,
        };
      });

    const combined = [...circleActivities, ...processedActivities].sort(
      (a, b) => b.order - a.order
    );
    return combined.map(({ order, ...rest }) => rest);
  }, [alerts, callNumberMap, contactNames, memberNames]);
  // Count unhandled non-circle, non-trusted alerts (fraud, system health, etc.)
  // Exclude trusted alerts since they're shown on home/calls screens
  const pendingAlertCount = useMemo(
    () => alerts.filter((alert) =>
      !isHandledAlert(alert) &&
      !isCircleActivityAlert(alert) &&
      (alert.alert_type ?? '').toLowerCase() !== 'trusted'
    ).length,
    [alerts, isCircleActivityAlert]
  );

  // Count unhandled circle activities separately
  // Processed activities (handled by circle members) shouldn't count
  const unhandledCircleCount = useMemo(
    () => circleActivity.filter((item) => !isHandledAlert(item.alertRow)).length,
    [circleActivity]
  );

  // Total = non-circle alerts + circle alerts (no double counting)
  const newAlertsCount = pendingAlertCount + unhandledCircleCount;

  const handleDelete = useCallback(async (alertId: string) => {
    try {
      await authorizedFetch(`/alerts/${alertId}`, { method: 'DELETE' });
      setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
      // Immediately refresh badge count
      refreshAlertCount();
      logEvent('fraud_alert_dismissed', {
        screen: 'Alerts',
        extra: { alertId },
      });
      return true;
    } catch (err) {
      Alert.alert('Delete failed', 'Could not delete the alert right now.');
      logError(err, {
        screen: 'Alerts',
        extra: { alertId, reason: 'delete_failed' },
      });
      return false;
    }
  }, [refreshAlertCount]);

  const confirmDelete = useCallback(
    (alertId: string) => {
      Alert.alert(
        'Delete alert',
        'This permanently removes the alert. This cannot be undone. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => handleDelete(alertId),
          },
        ],
        { cancelable: true }
      );
    },
    [handleDelete]
  );

  const systemHealthAlerts = useMemo(() => {
    return alerts
      .filter(
        (alert) =>
          !isCircleActivityAlert(alert) &&
          !priorityIds.has(alert.id) &&
          !shieldIds.has(alert.id) &&
          (alert.payload?.auto === true ||
            alert.payload?.automation === true ||
            alert.payload?.system_event === true ||
            alert.status === 'blocked')
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [alerts, priorityIds, shieldIds]);

  const handledAlerts = useMemo(() => {
    const systemHealthIds = new Set(systemHealthAlerts.map((alert) => alert.id));
    // Show fraud/risk alerts that aren't priority/system/circle/trusted
    // Exclude trusted alerts - they're shown on home/calls screens
    return alerts
      .filter(
        (alert) =>
          !isCircleActivityAlert(alert) &&
          !priorityIds.has(alert.id) &&
          !systemHealthIds.has(alert.id) &&
          (alert.alert_type ?? '').toLowerCase() !== 'trusted' // Exclude trusted alerts
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [alerts, priorityIds, systemHealthAlerts, isCircleActivityAlert]);

  const handledIds = useMemo(
    () => new Set(handledAlerts.map((alert) => alert.id)),
    [handledAlerts]
  );

  const remainingAlerts = useMemo(
    () => filteredAlerts.filter((alert) => !handledIds.has(alert.id)),
    [filteredAlerts, handledIds]
  );

  const trustedAlerts = useMemo(
    () =>
      remainingAlerts.filter(
        (alert) => (alert.alert_type ?? '').toLowerCase() === 'trusted'
      ),
    [remainingAlerts]
  );

  const recentAlerts = useMemo(
    () =>
      remainingAlerts.filter(
        (alert) => (alert.alert_type ?? '').toLowerCase() !== 'trusted'
      ),
    [remainingAlerts]
  );

  const renderSectionHeader = (label: string, right?: ReactNode) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {right ? <View style={styles.sectionHeaderRight}>{right}</View> : null}
    </View>
  );

  const renderPrioritySection = () => {
    if (!priorityAlerts.length) return null;
    return (
      <View style={[styles.section, styles.prioritySection]}>
        {renderSectionHeader('Priority alerts')}
        <View style={styles.sectionCards}>
          {priorityAlerts.map((alert) => {
            const reason = formatReason(alert) ?? alert.payload?.reason ?? 'Matched high-risk behavior.';
            const scoreLabel =
              typeof alert.payload?.score === 'number' ? `${Math.round(alert.payload.score)}%` : undefined;
            const metaLabel = alert.status ?? 'Pending';
            const riskStyles = getRiskStyles(alert.risk_level ?? alert.payload?.riskLevel);
            const handlePress = () => {
              if (!alert.call_id) return;
              logEvent('fraud_alert_opened', {
                screen: 'Alerts',
                extra: {
                  alertId: alert.id,
                  callId: alert.call_id,
                  riskLevel: alert.risk_level ?? alert.payload?.riskLevel,
                },
              });
              navigateToCallDetail(alert.call_id);
            };
            return (
              <AlertCard
                key={`priority-${alert.id}`}
                categoryLabel="Security alert"
                title={formatDetectedTitle('Fraud detected', alert.risk_label)}
                description={reason}
                timestamp={formatRecencyLabel(alert.created_at)}
                metaLabel={metaLabel}
                scoreLabel={scoreLabel}
                scoreColor={riskStyles.accent}
                scoreBackgroundColor={riskStyles.background}
                actionLabel="Listen & review"
                iconName="shield-half-outline"
                iconColor={riskStyles.accent}
                stripColor={riskStyles.accent}
                onPress={alert.call_id ? handlePress : undefined}
              />
            );
          })}
        </View>
      </View>
    );
  };

  const renderSystemSection = () => {
    if (!systemHealthAlerts.length) return null;
    return (
      <View
        style={[
          styles.section,
          styles.systemSection,
          { backgroundColor: withOpacity(theme.colors.success, 0.011) },
        ]}
      >
        {renderSectionHeader('System health')}
        <View style={styles.sectionCards}>
          {systemHealthAlerts.map((alert) => {
            const reason = formatReason(alert) ?? alert.payload?.reason ?? 'Automated protection triggered.';
            const scoreLabel =
              typeof alert.payload?.score === 'number' ? `${Math.round(alert.payload.score)}%` : undefined;
            const metaLabel = alert.status ?? 'System';
            const riskStyles = getRiskStyles(alert.risk_level ?? alert.payload?.riskLevel);
            const handlePress = () => {
              if (!alert.call_id) return;
              logEvent('fraud_alert_opened', {
                screen: 'Alerts',
                extra: {
                  alertId: alert.id,
                  callId: alert.call_id,
                  riskLevel: alert.risk_level ?? alert.payload?.riskLevel,
                },
              });
              navigateToCallDetail(alert.call_id);
            };
            return (
              <AlertCard
                key={`system-${alert.id}`}
                categoryLabel="System shield"
                title={alert.risk_label ? capitalizeLabel(alert.risk_label) : 'System event'}
                timestamp={formatRecencyLabel(alert.created_at)}
                scoreLabel={scoreLabel}
                scoreColor={riskStyles.accent}
                scoreBackgroundColor={riskStyles.background}
                iconName="shield-checkmark-outline"
                iconColor={riskStyles.accent}
                muted={Boolean(alert.processed)}
                onPress={alert.call_id ? handlePress : undefined}
              />
            );
          })}
        </View>
      </View>
    );
  };

  const renderTrustedSection = () => {
    if (!trustedAlerts.length) return null;
    const successColor = getRiskStyles('low').accent;
    const successBackground = getRiskStyles('low').background;
    return (
      <View
        style={[
          styles.section,
          styles.trustedSection,
          { backgroundColor: withOpacity(theme.colors.success, 0.01) },
        ]}
      >
        <Text style={styles.sectionLabel}>Trusted contacts</Text>
        <View style={styles.sectionCards}>
          {trustedAlerts.map((alert) => {
            const callerNumber =
              (alert.payload?.callerNumber as string | undefined) ||
              (alert.payload?.caller_number as string | undefined) ||
              (alert.call_id ? callNumberMap[alert.call_id] : undefined);
            const callerName = callerNumber ? contactNames[callerNumber] : '';
            const resolvedName = callerName || formatPhoneNumber(callerNumber, 'Trusted contact');
            const scoreLabel =
              typeof alert.payload?.score === 'number' ? `${Math.round(alert.payload.score)}%` : undefined;
            const statusLabel = alert.status ?? 'Trusted call';
            const handlePress = () => {
              if (!alert.call_id) return;
              logEvent('fraud_alert_opened', {
                screen: 'Alerts',
                extra: {
                  alertId: alert.id,
                  callId: alert.call_id,
                  riskLevel: alert.risk_level ?? alert.payload?.riskLevel,
                },
              });
              navigateToCallDetail(alert.call_id);
            };
            return (
              <AlertCard
                key={`trusted-${alert.id}`}
                categoryLabel="Trusted circle"
                title={resolvedName}
                timestamp={formatRecencyLabel(alert.created_at)}
                scoreLabel={scoreLabel}
                scoreColor={successColor}
                scoreBackgroundColor={successBackground}
                iconName="person-circle-outline"
                iconColor={successColor}
                onPress={alert.call_id ? handlePress : undefined}
              />
            );
          })}
        </View>
      </View>
    );
  };

  const renderCircleSection = () => {
    if (!circleActivity.length) return null;
    const preview = circleActivity.slice(0, 2);
    const hasMore = circleActivity.length > preview.length;
    const headerRight = hasMore ? (
      <TouchableOpacity style={styles.circleViewAllButton} onPress={openCircleFeed} activeOpacity={0.7}>
        <Text style={[styles.circleViewAllText, { color: theme.colors.accent }]}>View all</Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={theme.colors.accent}
          style={styles.circleViewAllIcon}
        />
      </TouchableOpacity>
    ) : undefined;
    return (
      <View style={[styles.section, styles.circleSection]}>
        {renderSectionHeader('Circle activity', headerRight)}
        <View style={styles.sectionCards}>
          {preview.map((activity) => (
            <AlertCard
              key={activity.id}
              title={activity.label}
              description={activity.description}
              timestamp={activity.timestamp}
              iconName="people-outline"
              iconColor={theme.colors.accent}
              iconBackgroundColor={withOpacity(theme.colors.accent, 0.18)}
              onLongPress={
                canManageProfile ? () => showTray(activity.alertRow) : undefined
              }
            />
          ))}
        </View>
      </View>
    );
  };

  const openCircleFeed = useCallback(() => {
    navigation.navigate('CircleActivityModal', { activities: circleActivity });
  }, [circleActivity, navigation]);

  const showTray = useCallback(
    (alert: AlertRow) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTrayAlert(alert);
      setIsTrayMounted(true);
      setTrayProcessing(false);
      setActiveTrayAction(null);
      trayAnim.setValue(0);
      Animated.timing(trayAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [trayAnim]
  );

  const hideTray = useCallback(() => {
    void Haptics.selectionAsync();
    Animated.timing(trayAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsTrayMounted(false);
      setTrayAlert(null);
      setTrayProcessing(false);
      setActiveTrayAction(null);
    });
  }, [trayAnim]);

  const handleTrayDelete = useCallback(async () => {
    if (!trayAlert) return;
    setTrayProcessing(true);
    setActiveTrayAction('delete');
    const success = await handleDelete(trayAlert.id);
    setTrayProcessing(false);
    setActiveTrayAction(null);
    if (success) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      hideTray();
    }
  }, [handleDelete, hideTray, trayAlert]);

  const renderHandledSection = () => {
    if (!handledAlerts.length) return null;
    return (
      <View style={[styles.section, styles.handledSection]}>
        <Text style={styles.sectionLabel}>Handled alerts</Text>
        <View style={styles.sectionCards}>
          {handledAlerts.map((alert) => {
            const reason = formatReason(alert) ?? alert.payload?.reason ?? 'Suspicious call detected.';
            const callerNumber =
              (alert.payload?.callerNumber as string | undefined) ||
              (alert.payload?.caller_number as string | undefined) ||
              (alert.call_id ? callNumberMap[alert.call_id] : undefined);
            const callerName = callerNumber ? contactNames[callerNumber] : '';
            const nameOrNumber = callerName || formatPhoneNumber(callerNumber) || 'Unknown caller';
            const greyAccent = theme.colors.textDim;
            const greyBackground = withOpacity(greyAccent, 0.25);
            const handledTimestamp = alert.feedback_at ?? alert.created_at;
            const timestamp = formatHandledTimestampLabel(handledTimestamp);
            const handlePress = () => {
              if (!alert.call_id) return;
              navigateToCallDetail(alert.call_id);
            };
            const statusLabel = alert.processed ? 'Handled' : alert.status ?? 'Handled';
            const scoreLabel =
              typeof alert.payload?.score === 'number' ? `${Math.round(alert.payload.score)}%` : undefined;
            // Build description without duplicating caller info
            const description = reason || 'Previous alert';
            return (
                <AlertCard
                  key={`handled-${alert.id}`}
                categoryLabel="Handled alert"
                title={nameOrNumber}
                 description={description}
                timestamp={timestamp}
                 metaLabel={statusLabel}
                 scoreLabel={scoreLabel}
                scoreColor={greyAccent}
                scoreBackgroundColor={greyBackground}
                iconName="alert-circle-outline"
                iconColor={greyAccent}
                stripColor={greyAccent}
                actionLabel="View details"
                muted
                onPress={alert.call_id ? handlePress : undefined}
                  onLongPress={
                    canManageProfile ? () => showTray(alert) : undefined
                  }
                />
            );
          })}
        </View>
      </View>
    );
  };

  const hasTopSections =
    priorityAlerts.length > 0 ||
    systemHealthAlerts.length > 0 ||
    handledAlerts.length > 0 ||
    circleActivity.length > 0;

  // For empty state: only show when there are literally NO alerts on screen
  // Including handled alerts - if they're visible, don't show empty state
  const hasAnyAlertsToShow =
    priorityAlerts.length > 0 ||
    systemHealthAlerts.length > 0 ||
    circleActivity.length > 0 ||
    handledAlerts.length > 0 ||
    recentAlerts.length > 0;

  const renderOtherAlerts = () => {
    if (!recentAlerts.length) return null;
    return (
      <View style={[styles.section, styles.otherSection]}>
        <View style={styles.sectionInner}>
          <Text style={styles.sectionLabel}>Recent alerts</Text>
          <View style={styles.sectionCards}>
            {recentAlerts.map((item) => {
              const reason = formatReason(item) ?? item.payload?.reason ?? 'Suspicious call detected.';
              const callerNumber =
                (item.payload?.callerNumber as string | undefined) ||
                (item.payload?.caller_number as string | undefined) ||
                (item.call_id ? callNumberMap[item.call_id] : undefined);
              const callerName = callerNumber ? contactNames[callerNumber] : '';
              const nameOrNumber = callerName || formatPhoneNumber(callerNumber) || 'Unknown caller';
              const scoreLabel =
                typeof item.payload?.score === 'number' ? `${Math.round(item.payload.score)}%` : undefined;
              const riskStyles = getRiskStyles(item.risk_level ?? item.payload?.riskLevel);
              const statusLabel = item.processed && item.status === 'pending' ? 'Resolved' : item.status ?? 'Pending';
              const iconName =
                (item.risk_label ?? '').toLowerCase() === 'safe'
                  ? 'shield-checkmark-outline'
                  : (item.risk_label ?? '').toLowerCase() === 'fraud'
                  ? 'alert-circle-outline'
                  : 'information-circle-outline';
              const handlePress = () => {
                if (!item.call_id) return;
                navigateToCallDetail(item.call_id);
              };
              return (
                <AlertCard
                  key={item.id}
                  categoryLabel={iconName === 'alert-circle-outline' ? 'Fraud alert' : 'Alert'}
                  title={nameOrNumber}
                  description={`${reason} • ${
                    callerName ? callerName : formatPhoneNumber(callerNumber)
                  }`}
                  timestamp={formatRecencyLabel(item.created_at)}
                  metaLabel={statusLabel}
                  scoreLabel={scoreLabel}
                  scoreColor={riskStyles.accent}
                  iconName={iconName}
                  iconColor={riskStyles.accent}
                  stripColor={riskStyles.accent}
                  actionLabel="View details"
                  muted={isHandledAlert(item)}
                  onPress={item.call_id ? handlePress : undefined}
                />
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const active = nextState === 'active';
      setIsAppActive(active);
      if (active) {
        loadAlerts();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);
  const bottomGap = Math.max(insets.bottom, 0) + 20;

  const trayTranslateY = trayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
    extrapolate: 'clamp',
  });
  const trayBackdropOpacity = trayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.45],
    extrapolate: 'clamp',
  });
  const deleteActionLabel =
    trayProcessing && activeTrayAction === 'delete' ? 'Working…' : 'Delete alert';
  const trayHandledTimestamp = trayAlert?.feedback_at ?? trayAlert?.created_at;
  const trayHandledDisplay =
    trayHandledTimestamp && formatAlertDateLabel(trayHandledTimestamp)
      ? `${formatAlertTime(trayHandledTimestamp)} · ${formatAlertDateLabel(trayHandledTimestamp)}`
      : trayHandledTimestamp
      ? formatAlertTime(trayHandledTimestamp)
      : '';
  const circleTrayCopy = useMemo(() => {
    if (!trayAlert) {
      return { title: 'Alert options', subtitle: 'Alert', detail: '' };
    }
    const detail = trayHandledDisplay;
    if (!CIRCLE_ALERT_TYPES.has(trayAlert.alert_type ?? '')) {
      return { title: 'Alert options', subtitle: trayAlert?.risk_label ?? 'Handled alert', detail };
    }
    return getCircleTrayCopy(trayAlert, detail);
  }, [trayAlert, trayHandledDisplay]);
  const isTrayVisible = isTrayMounted && Boolean(trayAlert);

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12), paddingBottom: bottomGap }]}
      edges={[]}
    >
      <View style={styles.headerWrapper}>
        <DashboardHeader
          title="Alerts"
          subtitle={`You have ${newAlertsCount} new alert${newAlertsCount === 1 ? '' : 's'}`}
          supportAction={{
            onPress: handleSupportPress,
            unreadCount: unreadAgentCount,
          }}
        />
      </View>
      <View style={styles.listWrapper}>
        <LinearGradient colors={topScrimColors} style={styles.topScrim} pointerEvents="none" />
        <ScrollView
          ref={listRef}
          contentContainerStyle={[
            styles.scrollContent,
            !showSkeleton && !hasAnyAlertsToShow && styles.listEmptyContent,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => loadAlerts()}
              tintColor={refreshControlProps.tintColor}
              colors={refreshControlProps.colors}
              progressBackgroundColor={refreshControlProps.progressBackgroundColor}
            />
          }
        >
          {showSkeleton ? (
            <Animated.View style={[styles.skeletonWrapper, { opacity: shimmer }]}>
              {skeletonRows.map((key) => (
                <View key={key} style={styles.skeletonCard}>
                  <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
                </View>
              ))}
            </Animated.View>
          ) : null}
          {renderPrioritySection()}
          {renderSystemSection()}
          {renderCircleSection()}
          {renderHandledSection()}
          {renderOtherAlerts()}
          {!hasAnyAlertsToShow && !showSkeleton ? (
            <View style={styles.emptyStateWrap}>
              <EmptyState
                icon="alert-circle-outline"
                title="No alerts"
                body="We will surface anything suspicious here as soon as it happens."
              />
            </View>
          ) : null}
        </ScrollView>
      </View>
      {isTrayVisible && (
        <Modal visible={isTrayVisible} transparent animationType="none" onRequestClose={hideTray}>
          <View style={styles.trayOverlay} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.trayBackdrop,
                { opacity: trayBackdropOpacity, position: 'absolute', width: '100%', height: '100%' },
              ]}
            />
            <Pressable style={StyleSheet.absoluteFill} onPress={hideTray} />
            {trayAlert && (
            <Animated.View
              style={[
                styles.tray,
                {
                  transform: [{ translateY: trayTranslateY }],
                },
              ]}
            >
              <View style={styles.trayContent}>
                <View style={styles.trayHandle} />
                <Text style={styles.trayTitle}>{circleTrayCopy.title}</Text>
                <Text style={styles.traySubtitle}>{circleTrayCopy.subtitle}</Text>
                {circleTrayCopy.detail ? (
                  <Text style={styles.trayDetail}>{circleTrayCopy.detail}</Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.trayAction,
                    styles.trayDanger,
                    pressed && styles.trayActionPressed,
                    trayProcessing && styles.trayActionDisabled,
                  ]}
                  onPress={handleTrayDelete}
                  disabled={trayProcessing}
                >
                  <Text style={[styles.trayActionText, styles.trayDangerText]}>{deleteActionLabel}</Text>
                  <Text style={styles.trayActionHint}>Removes the alert permanently.</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.trayAction,
                    styles.trayCancel,
                    pressed && styles.trayActionPressed,
                  ]}
                  onPress={hideTray}
                  disabled={trayProcessing}
                >
                  <Text style={styles.trayCancelText}>Cancel</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </View>
        </Modal>
      )}
      <View style={styles.bottomMask} pointerEvents="none" />
    </SafeAreaView>
  );
}

const createAlertStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 24,
      backgroundColor: theme.colors.bg,
    },
    headerWrapper: {
      marginBottom: 0,
    },
    bottomMask: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 120,
      backgroundColor: theme.colors.bg,
    },
    listWrapper: {
      flex: 1,
      position: 'relative',
      paddingTop: 0,
    },
    topScrim: {
      position: 'absolute',
      left: -24,
      right: -24,
      top: 0,
      height: 56,
      zIndex: 2,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: 120,
      paddingTop: 12,
      paddingHorizontal: 0,
    },
    listEmptyContent: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    section: {
      paddingHorizontal: 0,
      paddingVertical: 20,
      borderRadius: 24,
      marginBottom: -20,
      alignSelf: 'stretch',
      width: '100%',
      backgroundColor: theme.colors.bg,
    },
    sectionInner: {
      paddingHorizontal: 20,
    },
    otherSection: {
      borderWidth: 0,
      backgroundColor: theme.colors.bg,
    },
    sectionLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionHeaderRight: {
      marginLeft: 12,
    },
    sectionCards: {
      marginTop: 12,
    },
    prioritySection: {
      borderWidth: 0,
      borderColor: 'transparent',
    },
    systemSection: {
      borderWidth: 1,
      borderColor: 'rgba(52,211,153,0.25)',
    },
    circleSection: {
      borderWidth: 0,
      borderColor: 'transparent',
    },
    trustedSection: {
      borderWidth: 1,
      borderColor: 'rgba(16,185,129,0.25)',
    },
    handledSection: {
      borderWidth: 0,
      backgroundColor: theme.colors.bg,
    },
    circleViewAllButton: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleViewAllText: {
      fontSize: 14,
      fontWeight: '600',
    },
    circleViewAllIcon: {
      marginLeft: 4,
    },
    emptyStateWrap: {
      marginTop: -60,
      alignItems: 'stretch',
      paddingHorizontal: 0,
    },
    skeletonWrapper: {
      marginBottom: 12,
      marginTop: 18,
    },
    skeletonCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.12),
    },
    skeletonLine: {
      height: 10,
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
      marginTop: 10,
    },
    skeletonLineShort: {
      width: '45%',
      marginTop: 2,
    },
    skeletonLineTiny: {
      width: '35%',
    },
    trayOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      zIndex: 999,
      elevation: 999,
    },
    trayBackdrop: {
      backgroundColor: withOpacity(theme.colors.text, 0.2),
    },
    tray: {
      position: 'absolute',
      left: -12,
      right: -12,
      bottom: 0,
      borderRadius: 30,
      backgroundColor: theme.colors.surface,
      paddingVertical: 24,
      paddingHorizontal: 0,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.text, 0.08),
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      zIndex: 1000,
      elevation: 30,
    },
    trayHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: withOpacity(theme.colors.text, 0.3),
      alignSelf: 'center',
      marginBottom: 12,
    },
    trayTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'left',
      marginBottom: 6,
    },
    traySubtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      textAlign: 'left',
      marginBottom: 2,
    },
    trayDetail: {
      color: theme.colors.textDim,
      fontSize: 12,
      textAlign: 'left',
      marginBottom: 18,
    },
    trayAction: {
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 18,
      backgroundColor: withOpacity(theme.colors.text, 0.08),
      marginBottom: 12,
    },
    trayActionPressed: {
      opacity: 0.8,
    },
    trayActionDisabled: {
      opacity: 0.6,
    },
    trayActionText: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    trayActionHint: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    trayDanger: {
      backgroundColor: withOpacity(theme.colors.danger, 0.15),
    },
    trayDangerText: {
      color: theme.colors.danger,
    },
    trayCancel: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.12),
    },
    trayCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    trayContent: {
      paddingHorizontal: 30,
    },
  });
