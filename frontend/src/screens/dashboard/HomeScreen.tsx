import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  AppStateStatus,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { supabase } from '../../services/supabase';
import { authorizedFetch } from '../../services/backend';
import RecentCallCard from '../../components/home/RecentCallCard';
import StatTile from '../../components/home/StatTile';
import ActivityRow from '../../components/home/ActivityRow';
import NeedAssistanceCard from '../../components/home/NeedAssistanceCard';
import DashboardHeader from '../../components/common/DashboardHeader';
import { formatPhoneNumber } from '../../utils/formatPhoneNumber';
import { withOpacity } from '../../utils/color';
import {
  getSeenPinChangeAlertId,
  markPinChangeAlertSeen,
} from '../../utils/pinChangeNotice';
import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';
import { useSupportContext } from '../../context/SupportContext';
import { navigateToSupportPortal, rootNavigationRef } from '../../navigation/rootNavigator';

type CallRow = {
  id: string;
  created_at: string;
  transcript: string | null;
  fraud_risk_level: string | null;
  fraud_score: number | null;
  caller_number: string | null;
  feedback_status?: string | null;
};

type AlertRow = {
  id: string;
  call_id?: string | null;
  created_at: string;
  alert_type: string;
  status: string;
  payload: any;
  risk_label?: string | null;
  risk_level?: string | null;
};

type ActivityItem =
  | {
      type: 'call';
      id: string;
      created_at: string;
      label: string;
      badge: string;
      badgeLevel?: string;
      callId: string;
      muted?: boolean;
      viewOnly?: boolean;
    }
  | {
      type: 'alert';
      id: string;
      created_at: string;
      label: string;
      badge: string;
      badgeLevel?: string;
      muted?: boolean;
      viewOnly?: boolean;
      alertId?: string;
    };

type StatTile = {
  key: string;
  label: string;
  value: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBackgroundColor?: string;
  onPress: () => void;
  valueAnim?: Animated.Value;
};

type PinChangeNotice = {
  alertId: string;
  createdAt: string;
  actorLabel: string;
};

function formatPinChangeTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'an unknown time';
  }
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile } = useProfile();
  const sessionUserId = session?.user?.id ?? null;
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { unreadAgentCount, assistantOnline } = useSupportContext();
  const refreshControlProps = useMemo(
    () => ({
      tintColor: theme.colors.accent,
      colors: [theme.colors.accent],
      progressBackgroundColor: theme.colors.bg,
    }),
    [theme.colors.accent, theme.colors.bg]
  );
  const [recentCall, setRecentCall] = useState<CallRow | null>(null);
  const [recentTrustedAlert, setRecentTrustedAlert] = useState<{ label: string; created_at: string; alertId?: string } | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [alertsThisWeek, setAlertsThisWeek] = useState<number | null>(null);
  const [alertsToday, setAlertsToday] = useState<number | null>(null);
  const [alertsThisMonth, setAlertsThisMonth] = useState<number | null>(null);
  const [alertPeriod, setAlertPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [pinChangeNotice, setPinChangeNotice] = useState<PinChangeNotice | null>(null);
  const [showPinChangeModal, setShowPinChangeModal] = useState(false);
  const pinChangeModalAnim = useRef(new Animated.Value(0)).current;
  const pinChangeCheckInFlightRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem('home:alertPeriod').then((val) => {
      if (val === 'day' || val === 'week' || val === 'month') setAlertPeriod(val);
    }).catch(() => null);
  }, []);
  const alertValueAnim = useRef(new Animated.Value(1)).current;
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasInitialLoadCompleted, setHasInitialLoadCompleted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const scrollRef = useRef<ScrollView>(null);
  const email = session?.user.email ?? 'Account';
  const hasTwilioNumber = Boolean(activeProfile?.twilio_virtual_number);
  const loadStats = async (isRefresh = false, silent = false) => {
    if (!activeProfile) {
      setRecentCall(null);
      setRecentTrustedAlert(null);
      setRecentActivity([]);
      setAlertsThisWeek(null);
      setAlertsToday(null);
      setAlertsThisMonth(null);
      setBlockedCount(null);
      if (!session) {
        setLoading(false);
      }
      if (!silent) {
        setRefreshing(false);
      }
      return;
    }
    if (!silent) {
      setLoading(true);
    }
    try {
      const now = Date.now();
      const dayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

      const callsPromise = supabase
        .from('calls')
        .select(
          'id, created_at, transcript, fraud_risk_level, fraud_score, caller_number, feedback_status'
        )
        .eq('profile_id', activeProfile.id)
        .order('created_at', { ascending: false })
        .limit(3);

      const alertsDayPromise = supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', activeProfile.id)
        .eq('fraud_alert_required', true)
        .gte('created_at', dayAgo);

      const alertsWeekPromise = supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', activeProfile.id)
        .eq('fraud_alert_required', true)
        .gte('created_at', weekAgo);

      const alertsMonthPromise = supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', activeProfile.id)
        .eq('fraud_alert_required', true)
        .gte('created_at', monthAgo);

      const blockedPromise = supabase
        .from('blocked_callers')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', activeProfile.id);

      const [callsRes, alertsDayRes, alertsWeekRes, alertsMonthRes, blockedRes] = await Promise.all([
        callsPromise,
        alertsDayPromise,
        alertsWeekPromise,
        alertsMonthPromise,
        blockedPromise,
      ]);

      const callRows = callsRes.data ?? [];
      const nextRecentCall = callRows[0] ?? null;
      const nextAlertsThisWeek = alertsWeekRes.count ?? 0;
      const nextAlertsToday = alertsDayRes.count ?? 0;
      const nextAlertsThisMonth = alertsMonthRes.count ?? 0;
      const nextBlockedCount = blockedRes.count ?? 0;

      let alertRows: AlertRow[] = [];
      try {
        const alertData = await authorizedFetch(
          `/alerts?status=pending&limit=3&profileId=${encodeURIComponent(activeProfile.id)}`
        );
        alertRows = alertData?.alerts ?? [];
      } catch {
        alertRows = [];
      }

      const alertCallIds = alertRows
        .map((alert) => alert.call_id)
        .filter((callId): callId is string => Boolean(callId));
      let alertFeedbackMap = new Map<string, { feedback_status?: string | null; fraud_risk_level?: string | null }>();
      if (alertCallIds.length > 0) {
        const { data: alertCalls } = await supabase
          .from('calls')
          .select('id, feedback_status, fraud_risk_level')
          .in('id', alertCallIds);
        alertFeedbackMap = new Map(
          (alertCalls ?? []).map((row) => [
            row.id,
            { feedback_status: row.feedback_status ?? null, fraud_risk_level: row.fraud_risk_level ?? null },
          ])
        );
      }

      const contactNameMap: Record<string, string> = {};
      try {
        const raw = await AsyncStorage.getItem(`trusted_contacts_map:${activeProfile.id}`);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, { name?: string; numbers?: string[] } | string[]>;
          Object.values(parsed).forEach((entry) => {
            if (Array.isArray(entry)) {
              entry.forEach((number) => {
                if (number) {
                  contactNameMap[number] = contactNameMap[number] ?? 'Trusted contact';
                }
              });
            } else if (entry && typeof entry === 'object') {
              const name = entry.name ?? 'Trusted contact';
              const numbers = Array.isArray(entry.numbers) ? entry.numbers : [];
              numbers.forEach((number) => {
                if (number) {
                  contactNameMap[number] = name;
                }
              });
            }
          });
        }
      } catch {
        // Ignore local map failures.
      }

      const activityItems: ActivityItem[] = [
        ...callRows.map((call) => {
          const feedback = call.feedback_status ?? '';
          const isHandled = feedback === 'marked_fraud' || feedback === 'marked_safe';
          const badgeLabel =
            feedback === 'marked_fraud'
              ? 'FRAUD'
              : feedback === 'marked_safe'
              ? 'SAFE'
              : call.fraud_risk_level
              ? call.fraud_risk_level.toUpperCase()
              : 'CALL';
          const badgeLevel =
            feedback === 'marked_fraud'
              ? 'critical'
              : feedback === 'marked_safe'
              ? 'low'
              : call.fraud_risk_level ?? 'unknown';
          return {
            type: 'call' as const,
            id: call.id,
            created_at: call.created_at,
            label: call.caller_number ?? 'Unknown caller',
            badge: badgeLabel,
            badgeLevel,
            callId: call.id,
            muted: isHandled,
          };
        }),
        ...alertRows.map((alert) => {
          const isTrusted = alert.alert_type === 'trusted';
          const isPinChange = alert.alert_type === 'pin_change';
          const callerNumber = alert.payload?.callerNumber as string | undefined;
          const payloadContactName = (alert.payload?.contactName as string | undefined) ?? '';
          const callerName = payloadContactName || (callerNumber ? contactNameMap[callerNumber] : '');
          const feedback = alert.call_id ? alertFeedbackMap.get(alert.call_id)?.feedback_status ?? '' : '';
          const isHandled = feedback === 'marked_fraud' || feedback === 'marked_safe';
          const label =
            isTrusted
              ? callerName || callerNumber || 'Trusted contact'
              : isPinChange
              ? 'Pin change'
              : feedback === 'marked_fraud'
              ? 'Fraud'
              : feedback === 'marked_safe'
              ? 'Safe'
              : (alert.risk_label ?? alert.payload?.riskLevel ?? 'alert').toString();
          const badge =
            isPinChange
              ? 'PIN CHANGE'
              : isTrusted
              ? 'TRUSTED'
              : label.toUpperCase();
          const badgeLevel =
            isPinChange
              ? 'circle'
              : isTrusted
              ? 'circle'
              : feedback === 'marked_fraud'
              ? 'critical'
              : feedback === 'marked_safe'
              ? 'low'
              : alert.risk_level ?? alert.payload?.riskLevel ?? undefined;
          return {
            type: 'alert' as const,
            id: alert.id,
            created_at: alert.created_at,
            label: isTrusted
              ? callerName
                ? callerName
                : 'Trusted contact'
              : isPinChange
              ? 'Pin change'
              : 'Fraud alert',
            badge,
            badgeLevel,
            muted: isHandled,
            viewOnly: isTrusted,
            alertId: isTrusted ? alert.id : undefined,
          };
        }),
      ]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3);

      // Apply the full snapshot together to avoid partial first-paint states.
      setRecentCall(nextRecentCall);
      setAlertsThisWeek(nextAlertsThisWeek);
      setAlertsToday(nextAlertsToday);
      setAlertsThisMonth(nextAlertsThisMonth);
      setBlockedCount(nextBlockedCount);
      setRecentActivity(activityItems);

      // Surface most recent trusted alert for the featured event hero
      const latestTrusted = alertRows
        .filter((a) => a.alert_type === 'trusted')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
      if (latestTrusted) {
        const callerNumber = latestTrusted.payload?.callerNumber as string | undefined;
        const payloadName = (latestTrusted.payload?.contactName as string | undefined) ?? '';
        const resolvedName = payloadName || (callerNumber ? contactNameMap[callerNumber] : '') || 'Trusted contact';
        setRecentTrustedAlert({
          label: resolvedName,
          created_at: latestTrusted.created_at,
          alertId: latestTrusted.id,
        });
      } else {
        setRecentTrustedAlert(null);
      }
    } catch (error) {
      console.warn('[home] loadStats failed', error);
    } finally {
      if (!silent) {
        setHasInitialLoadCompleted(true);
      }
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.race([
        loadStats(true),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('home_refresh_timeout')), 12000)
        ),
      ]);
    } catch (err) {
      console.warn('[Home] Pull-to-refresh timed out or failed', err);
    } finally {
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile?.id]);

  useEffect(() => {
    setRecentCall(null);
    setRecentTrustedAlert(null);
    setRecentActivity([]);
    setAlertsThisWeek(null);
    setAlertsToday(null);
    setAlertsThisMonth(null);
    setBlockedCount(null);
    setPinChangeNotice(null);
    setShowPinChangeModal(false);
    setHasInitialLoadCompleted(false);
    loadStats();
  }, [activeProfile?.id]);

  useEffect(() => {
    const interval = isAppActive
      ? setInterval(() => {
          loadStats(true, true);
        }, 60000)
      : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeProfile, isAppActive]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const active = nextState === 'active';
      setIsAppActive(active);
      if (active) {
        loadStats(true, true);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  const dismissPinChangeModal = useCallback(async () => {
    const profileId = activeProfile?.id;
    if (profileId && sessionUserId && pinChangeNotice?.alertId) {
      await markPinChangeAlertSeen(profileId, sessionUserId, pinChangeNotice.alertId);
    }
    setShowPinChangeModal(false);
  }, [activeProfile?.id, pinChangeNotice?.alertId, sessionUserId]);

  const handlePinChangeSupportPress = useCallback(async () => {
    await dismissPinChangeModal();
    navigateToSupportPortal();
  }, [dismissPinChangeModal]);

  useEffect(() => {
    if (!showPinChangeModal) {
      pinChangeModalAnim.setValue(0);
      return;
    }
    pinChangeModalAnim.setValue(0);
    Animated.spring(pinChangeModalAnim, {
      toValue: 1,
      damping: 20,
      stiffness: 240,
      mass: 0.45,
      useNativeDriver: true,
    }).start();
  }, [pinChangeModalAnim, showPinChangeModal]);

  useEffect(() => {
    const profileId = activeProfile?.id;
    if (!profileId || !sessionUserId || !isAppActive) {
      return;
    }

    let cancelled = false;

    const loadLatestPinChangeNotice = async () => {
      if (pinChangeCheckInFlightRef.current) {
        return;
      }
      pinChangeCheckInFlightRef.current = true;
      try {
        const { data, error } = await supabase
          .from('alerts')
          .select('id, created_at, payload')
          .eq('profile_id', profileId)
          .eq('alert_type', 'pin_change')
          .order('created_at', { ascending: false })
          .limit(1);
        if (cancelled || error) {
          return;
        }
        const latest = data?.[0] as
          | { id: string; created_at: string; payload?: Record<string, unknown> | null }
          | undefined;
        if (!latest) {
          return;
        }
        const payload = (latest.payload ?? {}) as Record<string, unknown>;
        const actorUserId =
          typeof payload.actor_user_id === 'string' ? payload.actor_user_id : null;
        if (actorUserId === sessionUserId) {
          return;
        }
        const seenAlertId = await getSeenPinChangeAlertId(profileId, sessionUserId);
        if (cancelled || seenAlertId === latest.id) {
          return;
        }
        const actorLabel =
          typeof payload.actor_label === 'string' && payload.actor_label.trim().length > 0
            ? payload.actor_label.trim()
            : 'A circle member';
        setPinChangeNotice({
          alertId: latest.id,
          createdAt: latest.created_at,
          actorLabel,
        });
        setShowPinChangeModal(true);
      } catch (error) {
        console.warn('[home] Failed to load latest pin-change notice', error);
      } finally {
        pinChangeCheckInFlightRef.current = false;
      }
    };

    void loadLatestPinChangeNotice();
    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id, isAppActive, sessionUserId]);

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

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  // Check notification permission once on mount — show banner if not granted (required for CallKit)
  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then(({ status }) => setShowNotifBanner(status !== 'granted'))
      .catch(() => null);
  }, []);

  const handleNotifBannerEnable = useCallback(async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setShowNotifBanner(false);
      } else {
        Linking.openSettings();
      }
    } catch {
      Linking.openSettings();
    }
  }, []);

  const handleAlertPeriodPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    Animated.sequence([
      Animated.timing(alertValueAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(alertValueAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    setAlertPeriod((p) => {
      const next = p === 'day' ? 'week' : p === 'week' ? 'month' : 'day';
      AsyncStorage.setItem('home:alertPeriod', next).catch(() => null);
      return next;
    });
  }, [alertValueAnim]);

  const alertPeriodCount =
    alertPeriod === 'day' ? alertsToday :
    alertPeriod === 'month' ? alertsThisMonth :
    alertsThisWeek;

  const alertPeriodLabel =
    alertPeriod === 'day' ? 'Daily \nAlerts' :
    alertPeriod === 'month' ? 'Monthly \nAlerts' :
    'Weekly \nAlerts';

  const alertPeriodCaption =
    alertPeriod === 'day' ? 'last 24 hours' :
    alertPeriod === 'month' ? 'last 30 days' :
    'last 7 days';

  const skeletonRows = useMemo(() => Array.from({ length: 3 }, (_, i) => `skeleton-${i}`), []);
  const waitingForProfile = Boolean(session) && !activeProfile;
  const showSkeleton = waitingForProfile || !hasInitialLoadCompleted;
  const statTiles: StatTile[] = [
    {
      key: 'alerts',
      label: alertPeriodLabel,
      value: alertPeriodCount === null ? '—' : `${alertPeriodCount}`,
      caption: alertPeriodCaption,
      icon: 'alert-circle',
      iconColor: theme.colors.warning,
      iconBackgroundColor: withOpacity(theme.colors.warning, 0.15),
      onPress: handleAlertPeriodPress,
      valueAnim: alertValueAnim,
    },
    {
      key: 'blocked',
      label: 'Blocked Numbers',
      value: blockedCount === null ? '—' : `${blockedCount}`,
      caption: 'blocked',
      icon: 'ban',
      iconColor: theme.colors.danger,
      iconBackgroundColor: withOpacity(theme.colors.danger, 0.15),
      onPress: () =>
        navigation.navigate('SettingsTab', {
          screen: 'Settings',
          params: { initialScreen: 'Blocklist' },
        }),
    },
  ];

  const triggerLightHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
  }, []);

  const handleSupportPress = useCallback(() => {
    triggerLightHaptic();
    navigateToSupportPortal();
  }, [triggerLightHaptic]);

  const hasHeroCall = Boolean(recentCall?.caller_number);

  // Pick whichever is newer: a trusted alert or a regular call
  const trustedIsHero =
    recentTrustedAlert !== null &&
    (!hasHeroCall ||
      new Date(recentTrustedAlert.created_at).getTime() > new Date(recentCall!.created_at).getTime());

  const heroTitle = trustedIsHero
    ? recentTrustedAlert!.label
    : hasHeroCall
    ? formatPhoneNumber(recentCall?.caller_number, 'Recent Call')
    : hasTwilioNumber
    ? 'No calls yet'
    : waitingForProfile
    ? 'Loading…'
    : 'Missing #';
  const heroTranscript = trustedIsHero
    ? 'Trusted contact connected.'
    : recentCall?.transcript ?? (loading ? 'Loading…' : null);
  const heroIsHandledFraud = !trustedIsHero && hasHeroCall && recentCall?.feedback_status === 'marked_fraud';
  const heroFraudLevel = trustedIsHero
    ? 'low'
    : heroIsHandledFraud
    ? undefined
    : recentCall?.feedback_status === 'marked_fraud'
    ? 'critical'
    : recentCall?.feedback_status === 'marked_safe'
    ? 'low'
    : recentCall?.fraud_risk_level;
  const heroBadgeLabel = trustedIsHero
    ? 'Trusted'
    : heroIsHandledFraud
    ? 'Handled'
    : hasHeroCall && recentCall?.feedback_status === 'marked_safe'
    ? 'Safe'
    : undefined;
  const heroBadgeBackgroundColor = trustedIsHero
    ? withOpacity(theme.colors.accent, 0.16)
    : heroIsHandledFraud
    ? withOpacity(theme.colors.textDim, 0.2)
    : undefined;
  const heroBadgeTextColor = trustedIsHero
    ? theme.colors.accent
    : heroIsHandledFraud
    ? theme.colors.textDim
    : undefined;
  const heroSubtitleLabel = trustedIsHero
    ? undefined
    : hasHeroCall
    ? undefined
    : hasTwilioNumber
    ? 'Calls and alerts will show up here once they start.'
    : 'Managed in settings';

  const bottomGap = Math.max(insets.bottom, 0) + 20;
  const topScrimColors = useMemo(
    () =>
      [
        withOpacity(theme.colors.bg, 0.92),
        withOpacity(theme.colors.bg, 0.18),
        withOpacity(theme.colors.bg, 0),
      ] as const,
    [theme.colors.bg]
  );
  const pinChangeModalTranslateY = pinChangeModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });
  const pinChangeNoticeTimestamp = pinChangeNotice
    ? formatPinChangeTimestamp(pinChangeNotice.createdAt)
    : '';

  const handleViewAllPress = () => {
    triggerLightHaptic();
    navigation.navigate('AlertsTab');
  };

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12), paddingBottom: bottomGap }]}
      edges={['bottom']}
    >
      <View>
        <DashboardHeader
          title="Welcome Back"
          subtitle={activeProfile?.first_name ?? email}
          supportAction={{
            onPress: handleSupportPress,
            unreadCount: unreadAgentCount,
          }}
        />
      </View>

      <View style={styles.scrollContainer}>
        <LinearGradient colors={topScrimColors} style={styles.topScrim} pointerEvents="none" />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: bottomGap + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={refreshControlProps.tintColor}
              colors={refreshControlProps.colors}
              progressBackgroundColor={refreshControlProps.progressBackgroundColor}
            />
          }
        >
        {showSkeleton ? (
          <View>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Featured Event</Text>
              <Animated.View style={[styles.skeletonFeaturedCard, { opacity: shimmer }]}>
                <View style={styles.skeletonFeaturedHeader}>
                  <View style={styles.skeletonIconCircle} />
                  <View style={styles.skeletonHeaderTextWrap}>
                    <View style={[styles.skeletonLine, styles.skeletonHeaderLine]} />
                    <View style={[styles.skeletonLine, styles.skeletonMetaLine]} />
                  </View>
                  <View style={styles.skeletonBadge} />
                </View>
                <View style={styles.skeletonFeaturedBody}>
                  <View style={[styles.skeletonLine, styles.skeletonBodyLineLong]} />
                  <View style={[styles.skeletonLine, styles.skeletonBodyLineShort]} />
                </View>
                <View style={styles.skeletonFooterRow}>
                  <View style={[styles.skeletonLine, styles.skeletonFooterLine]} />
                  <View style={styles.skeletonFooterDot} />
                </View>
              </Animated.View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Quick Stats</Text>
              <View style={styles.statsGrid}>
                {[0, 1].map((index) => (
                  <Animated.View
                    key={`stats-skeleton-${index}`}
                    style={[
                      styles.statColumn,
                      index % 2 === 0 ? styles.rightMargin : null,
                      styles.skeletonStatCard,
                      { opacity: shimmer },
                    ]}
                  >
                    <View style={styles.skeletonStatTop}>
                      <View style={styles.skeletonStatValue} />
                      <View style={styles.skeletonStatIcon} />
                    </View>
                    <View style={[styles.skeletonLine, styles.skeletonStatLabel]} />
                    <View style={[styles.skeletonLine, styles.skeletonStatCaption]} />
                  </Animated.View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.activityHeader}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
                <View style={styles.skeletonViewAll} />
              </View>
              <View>
                {skeletonRows.map((key) => (
                  <Animated.View key={`activity-skeleton-${key}`} style={[styles.skeletonCard, { opacity: shimmer }]}>
                    <View style={styles.skeletonActivityLeft}>
                      <View style={styles.skeletonActivityIcon} />
                      <View style={styles.skeletonActivityText}>
                        <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                        <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
                      </View>
                    </View>
                    <View style={styles.skeletonPill} />
                  </Animated.View>
                ))}
              </View>
            </View>
          </View>
        ) : (
          <View>
            {showNotifBanner && (
              <View style={[styles.notifBanner, { backgroundColor: withOpacity(theme.colors.warning, 0.12), borderColor: withOpacity(theme.colors.warning, 0.3) }]}>
                <Ionicons name="notifications-off-outline" size={20} color={theme.colors.warning} style={styles.notifBannerIcon} />
                <View style={styles.notifBannerText}>
                  <Text style={[styles.notifBannerTitle, { color: theme.colors.text }]}>Notifications required for calls</Text>
                  <Text style={[styles.notifBannerSub, { color: theme.colors.textMuted }]}>Enable notifications so incoming calls can ring on your device.</Text>
                </View>
                <View style={styles.notifBannerActions}>
                  <Pressable onPress={handleNotifBannerEnable} style={[styles.notifBannerBtn, { backgroundColor: theme.colors.warning }]}>
                    <Text style={styles.notifBannerBtnText}>Enable</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Featured Event</Text>
              <RecentCallCard
                title={heroTitle}
                transcript={heroTranscript}
                createdAt={trustedIsHero ? recentTrustedAlert!.created_at : recentCall?.created_at}
                fraudLevel={heroFraudLevel}
                badgeLabel={heroBadgeLabel}
                badgeBackgroundColor={heroBadgeBackgroundColor}
                badgeTextColor={heroBadgeTextColor}
                hideBadge={!hasHeroCall && !trustedIsHero}
                subtitleLabel={heroSubtitleLabel}
                iconName={trustedIsHero ? 'shield-checkmark' : 'call'}
                iconColor={trustedIsHero ? theme.colors.accent : undefined}
                iconBackgroundColor={trustedIsHero ? withOpacity(theme.colors.accent, 0.12) : undefined}
                footerLabel={trustedIsHero ? 'View Call Details' : 'Review Call Recording'}
                emptyText={
                  hasTwilioNumber
                    ? 'No calls recorded yet.'
                    : 'Add a Verity Protect number to start recording calls.'
                }
                onPress={() => {
                  if (trustedIsHero && recentTrustedAlert?.alertId) {
                    rootNavigationRef.navigate('TrustedCallDetail', { alertId: recentTrustedAlert.alertId });
                  } else if (!trustedIsHero && recentCall?.id) {
                    navigation.navigate('CallsTab', {
                      screen: 'Calls',
                      params: { initialCallId: recentCall.id },
                    });
                  }
                }}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Quick Stats</Text>
              <View style={styles.statsGrid}>
                {statTiles.map((tile, index) => (
                  <View
                    key={tile.key}
                    style={[styles.statColumn, index % 2 === 0 ? styles.rightMargin : null]}
                  >
                    <StatTile
                      label={tile.label}
                      value={tile.value}
                      caption={tile.caption}
                      icon={tile.icon}
                      iconColor={tile.iconColor}
                      iconBackgroundColor={tile.iconBackgroundColor}
                      onPress={tile.onPress}
                      valueAnim={tile.valueAnim}
                    />
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.activityHeader}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
                <TouchableOpacity
                  style={styles.viewAllButton}
                  onPress={handleViewAllPress}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewAllText}>View All</Text>
                  <Ionicons name="chevron-forward" size={16} color="#2d6df6" style={styles.viewAllIcon} />
                </TouchableOpacity>
              </View>

              {loading && recentActivity.length === 0 ? (
                <View>
                  {skeletonRows.map((key) => (
                    <Animated.View
                      key={`activity-${key}`}
                      style={[styles.skeletonCard, { opacity: shimmer }]}
                    >
                      <View style={styles.skeletonActivityLeft}>
                        <View style={styles.skeletonActivityIcon} />
                        <View style={styles.skeletonActivityText}>
                          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                          <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
                        </View>
                      </View>
                      <View style={styles.skeletonPill} />
                    </Animated.View>
                  ))}
                </View>
              ) : recentActivity.length === 0 ? (
                <View style={styles.emptyStateWrap}>
                  <View style={styles.homeEmptyCard}>
                    <View style={styles.homeEmptyIcon}>
                      <Ionicons
                        name={hasTwilioNumber ? 'pulse-outline' : 'call-outline'}
                        size={24}
                        color={theme.colors.accent}
                      />
                    </View>
                    <Text style={styles.homeEmptyTitle}>
                      {hasTwilioNumber ? 'No activity yet' : 'Connect a SafeCall number'}
                    </Text>
                    <Text style={styles.homeEmptyBody}>
                      {hasTwilioNumber
                        ? 'Calls and alerts will show up here once they start.'
                        : 'Add your virtual number to start receiving and reviewing calls.'}
                    </Text>
                    {!hasTwilioNumber && (
                      <Pressable
                        style={({ pressed }) => [
                          styles.homeEmptyCta,
                          {
                            backgroundColor: pressed
                              ? withOpacity(theme.colors.accent, 0.15)
                              : 'transparent',
                          },
                        ]}
                        onPress={() => {
                          triggerLightHaptic();
                          navigation.navigate('SettingsTab');
                        }}
                      >
                      <Text style={styles.homeEmptyCtaText}>
                        Set up number
                      </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.activityList}>
                  {recentActivity.map((item) => {
                    const isTrustedActivity = item.badge === 'TRUSTED';
                    return (
                      <View key={item.id} style={styles.activityItem}>
                        <ActivityRow
                          type={item.type}
                          label={item.label}
                          createdAt={item.created_at}
                          badge={item.badge}
                          iconName={isTrustedActivity ? 'shield-checkmark' : undefined}
                          iconColor={isTrustedActivity ? theme.colors.accent : undefined}
                          iconBackgroundColor={
                            isTrustedActivity ? withOpacity(theme.colors.accent, 0.16) : undefined
                          }
                          muted={item.muted}
                          disabled={false}
                          badgeLevel={
                            item.badge === 'FRAUD'
                              ? 'critical'
                              : item.badge === 'SAFE'
                              ? 'low'
                              : item.badgeLevel
                          }
                          onPress={() => {
                            if (item.viewOnly && item.type === 'alert' && item.alertId) {
                              rootNavigationRef.navigate('TrustedCallDetail', { alertId: item.alertId });
                              return;
                            }
                            if (item.viewOnly) {
                              return;
                            }
                            if (item.type === 'call') {
                              navigation.navigate('CallsTab', {
                                screen: 'Calls',
                                params: { initialCallId: item.callId },
                              });
                              return;
                            }
                            navigation.navigate('AlertsTab');
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <NeedAssistanceCard onPress={navigateToSupportPortal} />
            </View>
          </View>
        )}
        </ScrollView>
      </View>
      {pinChangeNotice ? (
        <Modal
          transparent
          visible={showPinChangeModal}
          animationType="none"
          onRequestClose={() => {
            void dismissPinChangeModal();
          }}
        >
          <View style={styles.pinNoticeOverlay}>
            <Pressable
              style={styles.pinNoticeBackdrop}
              onPress={() => {
                void dismissPinChangeModal();
              }}
            />
            <Animated.View
              style={[
                styles.pinNoticeCard,
                {
                  opacity: pinChangeModalAnim,
                  transform: [{ translateY: pinChangeModalTranslateY }],
                },
              ]}
            >
              <View style={styles.pinNoticeIconWrap}>
                <Ionicons name="keypad-outline" size={18} color={theme.colors.warning} />
              </View>
              <Text style={styles.pinNoticeTitle}>Safety PIN changed</Text>
              <Text style={styles.pinNoticeBody}>
                {pinChangeNotice.actorLabel} changed the Safety PIN on {pinChangeNoticeTimestamp}.
                Contact them first if a caller cannot get through.
              </Text>
              <Text style={styles.pinNoticeSupportCopy}>
                Lost PIN reset requests go through support identity checks and take at least 1 hour.
              </Text>
              <View style={styles.pinNoticeActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.pinNoticeButton,
                    styles.pinNoticeButtonSecondary,
                    pressed && styles.pinNoticeButtonPressed,
                  ]}
                  onPress={() => {
                    void handlePinChangeSupportPress();
                  }}
                >
                  <Text style={styles.pinNoticeButtonSecondaryText}>Contact support</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.pinNoticeButton,
                    styles.pinNoticeButtonPrimary,
                    pressed && styles.pinNoticeButtonPressed,
                  ]}
                  onPress={() => {
                    void dismissPinChangeModal();
                  }}
                >
                  <Text style={styles.pinNoticeButtonPrimaryText}>Got it</Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 24,
      backgroundColor: theme.colors.bg,
    },
    scrollContainer: {
      flex: 1,
      position: 'relative',
    },
    topScrim: {
      position: 'absolute',
      left: -24,
      right: -24,
      top: 0,
      height: 56,
      zIndex: 2,
    },
    content: {
      paddingTop: 12,
    },
    pinNoticeOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      paddingHorizontal: 24,
      paddingBottom: 28,
      backgroundColor: withOpacity(theme.colors.text, 0.34),
    },
    pinNoticeBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    pinNoticeCard: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 18,
      gap: 10,
      shadowColor: theme.colors.text,
      shadowOpacity: 0.14,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    pinNoticeIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.warning, 0.16),
    },
    pinNoticeTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    pinNoticeBody: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.text,
    },
    pinNoticeSupportCopy: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textMuted,
    },
    pinNoticeActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    pinNoticeButton: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    pinNoticeButtonSecondary: {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.border,
    },
    pinNoticeButtonPrimary: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    pinNoticeButtonPressed: {
      opacity: 0.88,
    },
    pinNoticeButtonSecondaryText: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    pinNoticeButtonPrimaryText: {
      color: theme.colors.surface,
      fontSize: 14,
      fontWeight: '700',
    },
    notifBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 1,
      padding: 12,
      marginBottom: 4,
    },
    notifBannerIcon: {
      marginRight: 10,
    },
    notifBannerText: {
      flex: 1,
    },
    notifBannerTitle: {
      fontSize: 13,
      fontWeight: '600',
    },
    notifBannerSub: {
      fontSize: 12,
      marginTop: 1,
    },
    notifBannerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 8,
      gap: 6,
    },
    notifBannerBtn: {
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    notifBannerBtnText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    section: {
      marginTop: 20,
    },
    sectionLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 12,
    },
    statsGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    },
    statColumn: {
      width: '48%',
      marginBottom: 12,
    },
    rightMargin: {
      marginRight: 8,
    },
    activityHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.colors.textMuted,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    viewAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    viewAllText: {
      color: theme.colors.accent,
      fontWeight: '600',
      fontSize: 13,
    },
    viewAllIcon: {
      marginLeft: 4,
    },
    activityList: {
      marginTop: 8,
    },
    activityItem: {
      marginBottom: 12,
    },
    emptyStateWrap: {
      alignItems: 'stretch',
      paddingHorizontal: 0,
      marginTop: 8,
    },
    homeEmptyCard: {
      borderRadius: 28,
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      width: '100%',
      alignSelf: 'stretch',
      backgroundColor: theme.colors.surface,
      borderColor: withOpacity(theme.colors.text, 0.08),
    },
    homeEmptyIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.text, 0.1),
      backgroundColor: theme.colors.surfaceAlt,
    },
    homeEmptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 4,
      textAlign: 'center',
      color: theme.colors.text,
    },
    homeEmptyBody: {
      fontSize: 14,
      textAlign: 'center',
      color: theme.colors.textMuted,
    },
    homeEmptyCta: {
      marginTop: 12,
      paddingVertical: 10,
      paddingHorizontal: 28,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.text, 0.1),
      alignItems: 'center',
    },
    homeEmptyCtaText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.accent,
    },
    skeletonFeaturedCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      padding: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.text, 0.12),
      marginBottom: 16,
    },
    skeletonFeaturedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    skeletonIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
      marginRight: 12,
    },
    skeletonHeaderTextWrap: {
      flex: 1,
      marginRight: 12,
    },
    skeletonHeaderLine: {
      width: '62%',
      marginTop: 0,
    },
    skeletonMetaLine: {
      width: '45%',
      marginTop: 8,
    },
    skeletonBadge: {
      width: 74,
      height: 24,
      borderRadius: 999,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
    },
    skeletonFeaturedBody: {
      borderRadius: 18,
      padding: 18,
      backgroundColor: withOpacity(theme.colors.text, 0.08),
      marginBottom: 14,
    },
    skeletonBodyLineLong: {
      width: '90%',
      marginTop: 0,
    },
    skeletonBodyLineShort: {
      width: '66%',
      marginTop: 8,
    },
    skeletonFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    skeletonFooterLine: {
      width: '44%',
      marginTop: 0,
    },
    skeletonFooterDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
    },
    skeletonStatCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 22,
      padding: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.text, 0.12),
    },
    skeletonStatTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    skeletonStatValue: {
      width: 52,
      height: 34,
      borderRadius: 8,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
    },
    skeletonStatIcon: {
      width: 36,
      height: 36,
      borderRadius: 16,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
    },
    skeletonStatLabel: {
      width: '72%',
      marginTop: 12,
    },
    skeletonStatCaption: {
      width: '48%',
      marginTop: 6,
    },
    skeletonViewAll: {
      width: 62,
      height: 14,
      borderRadius: 7,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
    },
    skeletonCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      padding: 18,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.12),
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    skeletonActivityLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 12,
    },
    skeletonActivityIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      marginRight: 14,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
    },
    skeletonActivityText: {
      flex: 1,
    },
    skeletonLine: {
      height: 10,
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
      marginTop: 10,
    },
    skeletonLineShort: {
      width: '50%',
      marginTop: 2,
    },
    skeletonLineTiny: {
      width: '35%',
    },
    skeletonPill: {
      height: 12,
      width: 54,
      borderRadius: 999,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
    },
  });
