import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { authorizedFetch } from '../../services/backend';
import AlertCard from '../../components/alerts/AlertCard';
import EmptyState from '../../components/common/EmptyState';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import { subscribeToCallUpdates } from '../../utils/callEvents';
import DashboardHeader from '../../components/common/DashboardHeader';
import { withOpacity } from '../../utils/color';
import { getRiskStyles } from '../../utils/risk';
import { formatPhoneNumber } from '../../utils/formatPhoneNumber';
import type { AppTheme } from '../../theme/tokens';
type AlertRow = {
  id: string;
  alert_type: string;
  status: string;
  created_at: string;
  payload: any;
  call_id: string | null;
  risk_label?: string | null;
  risk_level?: string | null;
  processed?: boolean;
  feedback_status?: string | null;
  feedback_at?: string | null;
  feedback_by_user_id?: string | null;
  handled_by_name?: string | null;
};

type CircleActivity = {
  id: string;
  label: string;
  description: string;
  timestamp: string;
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

export default function AlertsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const { theme } = useTheme();
  const styles = useMemo(() => createAlertStyles(theme), [theme]);
  const refreshControlProps = useMemo(
    () => ({
      tintColor: theme.colors.text,
      colors: [theme.colors.text],
      progressBackgroundColor: withOpacity(theme.colors.text, 0.16),
      styleBackgroundColor: withOpacity(theme.colors.surface, 0.25),
    }),
    [theme]
  );
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [callNumberMap, setCallNumberMap] = useState<Record<string, string>>({});
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const loadAlertsRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const listRef = useRef<ScrollView>(null);
  const [trayAlert, setTrayAlert] = useState<AlertRow | null>(null);
  const [isTrayMounted, setIsTrayMounted] = useState(false);
  const trayAnim = useRef(new Animated.Value(0)).current;
  const [trayProcessing, setTrayProcessing] = useState(false);
  const [activeTrayAction, setActiveTrayAction] = useState<'delete' | null>(null);
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

const formatAlertTime = (value: string) =>
  new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const formatAlertDateLabel = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const showYear = now.getFullYear() !== date.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(showYear ? { year: 'numeric' } : {}),
  });
};

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
      const data = await authorizedFetch('/alerts?limit=25');
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
        !alert.processed &&
        (highRiskLevels.has(riskLevel) ||
          (typeof alert.payload?.score === 'number' && alert.payload.score >= 80))
      );
    });
  }, [alerts]);
  const shieldAlerts = useMemo(() => {
    return alerts.filter(
      (alert) =>
        (alert.processed || alert.feedback_status === 'marked_safe') &&
        (alert.risk_label?.toLowerCase() === 'safe' ||
          alert.feedback_status === 'marked_safe' ||
          alert.payload?.auto === true)
    );
  }, [alerts]);
  const priorityIds = new Set(priorityAlerts.map((row) => row.id));
  const shieldIds = new Set(shieldAlerts.map((row) => row.id));
  const filteredAlerts = useMemo(
    () => sortedAlerts.filter((alert) => !priorityIds.has(alert.id) && !shieldIds.has(alert.id)),
    [sortedAlerts, priorityIds, shieldIds]
  );
  const circleActivity = useMemo<CircleActivity[]>(() => {
    const now = Date.now();
    const window = 1000 * 60 * 60 * 24; // last 24h
    return alerts
      .filter((alert) => alert.processed && new Date(alert.created_at).getTime() >= now - window)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 2)
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
        const timestamp = new Date(alert.created_at).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        return {
          id: alert.id,
          label: handlerName,
          description,
          timestamp,
        };
      });
  }, [alerts, callNumberMap, contactNames, memberNames]);

  const handleDelete = useCallback(async (alertId: string) => {
    try {
      await authorizedFetch(`/alerts/${alertId}`, { method: 'DELETE' });
      setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
      return true;
    } catch (err) {
      Alert.alert('Delete failed', 'Could not delete the alert right now.');
      return false;
    }
  }, []);

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
    return alerts
      .filter(
        (alert) =>
          isHandledAlert(alert) &&
          !priorityIds.has(alert.id) &&
          !systemHealthIds.has(alert.id)
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [alerts, priorityIds, systemHealthAlerts]);

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

  const renderSectionHeader = (label: string) => (
    <Text style={styles.sectionLabel}>{label}</Text>
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
              typeof alert.payload?.score === 'number' ? `Risk ${Math.round(alert.payload.score)}%` : undefined;
            const metaLabel = alert.status ?? 'Pending';
            const riskStyles = getRiskStyles(alert.risk_level ?? alert.payload?.riskLevel);
            const handlePress = () => {
              if (!alert.call_id) return;
              navigateToCallDetail(alert.call_id);
            };
            return (
              <AlertCard
                key={`priority-${alert.id}`}
                categoryLabel="Security alert"
                title={alert.risk_label ? `${alert.risk_label} detected` : 'Fraud detected'}
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
            const metaLabel = alert.status ?? 'System';
            const riskStyles = getRiskStyles(alert.risk_level ?? alert.payload?.riskLevel);
            const handlePress = () => {
              if (!alert.call_id) return;
              navigateToCallDetail(alert.call_id);
            };
            return (
              <AlertCard
                key={`system-${alert.id}`}
                categoryLabel="System shield"
                title={alert.risk_label ?? 'System event'}
                description={reason}
                timestamp={formatRecencyLabel(alert.created_at)}
                metaLabel={metaLabel}
                actionLabel="View details"
                iconName="shield-checkmark-outline"
                iconColor={riskStyles.accent}
                stripColor={riskStyles.accent}
                muted={Boolean(alert.processed)}
                scoreColor={riskStyles.accent}
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
            const description =
              alert.payload?.reason ??
              `${resolvedName} was bridged directly because they are on your trusted list.`;
            const statusLabel = alert.status ?? 'Trusted call';
            const handlePress = () => {
              if (!alert.call_id) return;
              navigateToCallDetail(alert.call_id);
            };
            return (
              <AlertCard
                key={`trusted-${alert.id}`}
                categoryLabel="Trusted circle"
                title={resolvedName}
                description={description}
                timestamp={formatRecencyLabel(alert.created_at)}
                metaLabel={statusLabel}
                scoreLabel="Safe"
                scoreColor={successColor}
                scoreBackgroundColor={successBackground}
                actionLabel="View details"
                iconName="person-circle-outline"
                iconColor={successColor}
                stripColor={successColor}
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
    return (
      <View style={[styles.section, styles.circleSection]}>
        {renderSectionHeader('Circle activity')}
        <View style={styles.circleGroup}>
          {circleActivity.map((activity) => (
            <View key={activity.id} style={styles.circleCard}>
              <View style={[styles.circleAccentStrip, { backgroundColor: theme.colors.accent }]} />
              <View style={styles.circleCardContent}>
                <View style={styles.circleHeaderRow}>
                  <View
                    style={[
                      styles.circleIconWrapper,
                      { backgroundColor: withOpacity(theme.colors.accent, 0.16) },
                    ]}
                  >
                    <Ionicons name="people-outline" size={16} color={theme.colors.accent} />
                  </View>
                  <Text style={[styles.circleTitle, { color: theme.colors.textMuted }]}> 
                    {activity.label}
                  </Text>
                  <View style={styles.circleHeaderSpacer} />
                  <Ionicons name="time-outline" size={12} color={theme.colors.textDim} />
                  <Text style={[styles.circleTimestamp, { color: theme.colors.textDim }]}> 
                    {activity.timestamp}
                  </Text>
                </View>
                <Text style={[styles.circleDescription, { color: theme.colors.textMuted }]}> 
                  {activity.description}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

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
            const reason = formatReason(alert) ?? alert.payload?.reason ?? 'This alert has been handled.';
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
              typeof alert.payload?.score === 'number' ? `Risk ${Math.round(alert.payload.score)}%` : undefined;
            return (
              <AlertCard
                key={`handled-${alert.id}`}
                categoryLabel="Handled alert"
                title={alert.risk_label ? `${alert.risk_label} detected` : 'Handled alert'}
                 description={reason}
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
                onLongPress={() => showTray(alert)}
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
    circleActivity.length > 0 ||
    trustedAlerts.length > 0;

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
                typeof item.payload?.score === 'number' ? `Risk ${Math.round(item.payload.score)}%` : undefined;
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
  const isTrayVisible = isTrayMounted && Boolean(trayAlert);

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12), paddingBottom: bottomGap }]}
      edges={[]}
    >
      <View style={styles.headerWrapper}>
        <DashboardHeader title="Alerts" subtitle="Keep track of suspicious calls" />
      </View>
      <View style={styles.listWrapper}>
        <ScrollView
          ref={listRef}
          contentContainerStyle={[
            styles.scrollContent,
            !showSkeleton && !hasTopSections && remainingAlerts.length === 0 && styles.listEmptyContent,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => loadAlerts()}
              tintColor={refreshControlProps.tintColor}
              colors={refreshControlProps.colors}
              progressBackgroundColor={refreshControlProps.progressBackgroundColor}
              style={{ backgroundColor: refreshControlProps.styleBackgroundColor }}
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
          {renderTrustedSection()}
          {renderCircleSection()}
          {renderHandledSection()}
          {renderOtherAlerts()}
          {!hasTopSections && remainingAlerts.length === 0 && !showSkeleton ? (
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
              <View style={styles.trayHandle} />
              <Text style={styles.trayTitle}>Alert options</Text>
              <Text style={styles.traySubtitle}>{trayAlert.risk_label ?? 'Handled alert'}</Text>
              {trayHandledDisplay ? <Text style={styles.trayDetail}>{trayHandledDisplay}</Text> : null}
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
            </Animated.View>
          )}
        </View>
      </Modal>
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
    scrollContent: {
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
    circleGroup: {
      marginTop: 12,
    },
    circleCard: {
      borderRadius: 20,
      padding: 16,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.text, 0.08),
      position: 'relative',
      paddingLeft: 20,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
    },
    circleAccentStrip: {
      position: 'absolute',
      left: 0,
      top: 8,
      bottom: 8,
      width: 3,
      borderRadius: 999,
    },
    circleHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    circleIconWrapper: {
      width: 32,
      height: 32,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    circleHeaderSpacer: {
      flex: 1,
    },
    circleTitle: {
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
    },
    circleDescription: {
      fontSize: 13,
      lineHeight: 20,
    },
    circleCardContent: {
      flex: 1,
    },
    circleTimestamp: {
      fontSize: 12,
      letterSpacing: 0.2,
      textTransform: 'uppercase',
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
      paddingHorizontal: 26,
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
  });
