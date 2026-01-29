import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  AppStateStatus,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';

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
  | { type: 'call'; id: string; created_at: string; label: string; badge: string; badgeLevel?: string; callId: string }
  | { type: 'alert'; id: string; created_at: string; label: string; badge: string; badgeLevel?: string };

type StatTile = {
  key: string;
  label: string;
  value: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBackgroundColor?: string;
  onPress: () => void;
};

export default function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile } = useProfile();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const refreshControlProps = useMemo(
    () => ({
      tintColor: theme.colors.text,
      colors: [theme.colors.text],
      progressBackgroundColor: withOpacity(theme.colors.text, 0.16),
      styleBackgroundColor: withOpacity(theme.colors.surface, 0.25),
    }),
    [theme]
  );
  const [recentCall, setRecentCall] = useState<CallRow | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [alertsThisWeek, setAlertsThisWeek] = useState<number | null>(null);
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const scrollRef = useRef<ScrollView>(null);
  const email = session?.user.email ?? 'Account';
  const hasTwilioNumber = Boolean(activeProfile?.twilio_virtual_number);
  const loadStats = async (isRefresh = false, silent = false) => {
    if (!activeProfile) {
      setRecentCall(null);
      setRecentActivity([]);
      setAlertsThisWeek(null);
      setBlockedCount(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (isRefresh && !silent) {
      setRefreshing(true);
    } else if (!silent) {
      setLoading(true);
    }
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const callsPromise = supabase
        .from('calls')
        .select(
          'id, created_at, transcript, fraud_risk_level, fraud_score, caller_number, feedback_status'
        )
        .eq('profile_id', activeProfile.id)
        .order('created_at', { ascending: false })
        .limit(3);

      const alertsPromise = supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', activeProfile.id)
        .eq('fraud_alert_required', true)
        .gte('created_at', weekAgo);

      const blockedPromise = supabase
        .from('blocked_callers')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', activeProfile.id);

      const [callsRes, alertsRes, blockedRes] = await Promise.all([
        callsPromise,
        alertsPromise,
        blockedPromise,
      ]);

      const callRows = callsRes.data ?? [];
      setRecentCall(callRows[0] ?? null);
      setAlertsThisWeek(alertsRes.count ?? 0);
      setBlockedCount(blockedRes.count ?? 0);

      let alertRows: AlertRow[] = [];
      try {
        const alertData = await authorizedFetch('/alerts?status=pending&limit=3');
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
          };
        }),
        ...alertRows.map((alert) => {
          const isTrusted = alert.alert_type === 'trusted';
          const callerNumber = alert.payload?.callerNumber as string | undefined;
          const callerName = callerNumber ? contactNameMap[callerNumber] : '';
          const feedback = alert.call_id ? alertFeedbackMap.get(alert.call_id)?.feedback_status ?? '' : '';
          const label =
            isTrusted
              ? callerName || callerNumber || 'Trusted contact'
              : feedback === 'marked_fraud'
              ? 'Fraud'
              : feedback === 'marked_safe'
              ? 'Safe'
              : (alert.risk_label ?? alert.payload?.riskLevel ?? 'alert').toString();
          const badge = isTrusted ? 'TRUSTED' : label.toUpperCase();
          const badgeLevel =
            isTrusted
              ? 'low'
              : feedback === 'marked_fraud'
              ? 'critical'
              : feedback === 'marked_safe'
              ? 'low'
              : alert.risk_level ?? alert.payload?.riskLevel ?? undefined;
          return {
            type: 'alert' as const,
            id: alert.id,
            created_at: alert.created_at,
            label: isTrusted ? 'Trusted call' : 'Fraud alert',
            badge,
            badgeLevel,
          };
        }),
      ]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3);

    setRecentActivity(activityItems);
    if (!silent) {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [activeProfile]);

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
        loadStats(true);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

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

  const skeletonRows = useMemo(() => Array.from({ length: 3 }, (_, i) => `skeleton-${i}`), []);
  const showSkeleton = loading && !recentCall && recentActivity.length === 0;
  const contentOpacity = showSkeleton ? 0 : 1;
  const statTiles: StatTile[] = [
    {
      key: 'alerts',
      label: 'Weekly \nAlerts',
      value: alertsThisWeek === null ? '—' : `${alertsThisWeek}`,
      caption: 'alerts',
      icon: 'alert-circle',
      iconColor: theme.colors.warning,
      iconBackgroundColor: withOpacity(theme.colors.warning, 0.15),
      onPress: () => navigation.navigate('AlertsTab'),
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

  const triggerLightHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
  };

  const hasHeroCall = Boolean(recentCall?.caller_number);
  const heroTitle = hasHeroCall
    ? formatPhoneNumber(recentCall?.caller_number, 'Recent Call')
    : hasTwilioNumber
    ? 'No calls yet'
    : 'Missing #';
  const heroTranscript = recentCall?.transcript ?? (loading ? 'Loading…' : null);
  const heroFraudLevel =
    recentCall?.feedback_status === 'marked_fraud'
      ? 'critical'
      : recentCall?.feedback_status === 'marked_safe'
      ? 'low'
      : recentCall?.fraud_risk_level;
  const heroBadgeLabel =
    hasHeroCall && recentCall?.feedback_status === 'marked_fraud'
      ? 'Fraud'
      : hasHeroCall && recentCall?.feedback_status === 'marked_safe'
      ? 'Safe'
      : undefined;
  const heroSubtitleLabel = hasHeroCall
    ? undefined
    : hasTwilioNumber
    ? 'Calls and alerts will show up here once they start.'
    : 'Managed in settings';

  const bottomGap = Math.max(insets.bottom, 0) + 20;

  const handleViewAllPress = () => {
    triggerLightHaptic();
    navigation.navigate('AlertsTab');
  };

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12), paddingBottom: bottomGap }]}
      edges={['bottom']}
    >
      <View style={{}}>
        <DashboardHeader
            title="Welcome Back"
            subtitle={activeProfile?.first_name ?? email}
          />
      </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: bottomGap + 40 }]}
          showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadStats(true)}
            tintColor={refreshControlProps.tintColor}
            colors={refreshControlProps.colors}
            progressBackgroundColor={refreshControlProps.progressBackgroundColor}
            style={{ backgroundColor: refreshControlProps.styleBackgroundColor }}
          />
        }
        >
        {showSkeleton ? (
          <Animated.View style={[styles.skeletonOverlay, { opacity: shimmer }]}>
            {skeletonRows.map((key) => (
              <View key={key} style={styles.skeletonCard}>
                <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
              </View>
            ))}
          </Animated.View>
        ) : null}
        <View style={{ opacity: contentOpacity }}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Featured Event</Text>
            <RecentCallCard
              title={heroTitle}
              transcript={heroTranscript}
              createdAt={recentCall?.created_at}
              fraudLevel={heroFraudLevel}
              badgeLabel={heroBadgeLabel}
              hideBadge={!hasHeroCall}
              subtitleLabel={heroSubtitleLabel}
              emptyText={
                hasTwilioNumber
                  ? 'No calls recorded yet.'
                  : 'Add a Verity Protect number to start recording calls.'
              }
              onPress={() =>
                navigation.navigate('CallsTab', {
                  screen: 'Calls',
                  params: { initialCallId: recentCall?.id },
                })
              }
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
                    <View>
                      <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                      <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
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
                {recentActivity.map((item) => (
                  <View key={item.id} style={styles.activityItem}>
                    <ActivityRow
                      type={item.type}
                      label={item.label}
                      createdAt={item.created_at}
                      badge={item.badge}
                      badgeLevel={
                        item.badge === 'FRAUD'
                          ? 'critical'
                          : item.badge === 'SAFE'
                          ? 'low'
                          : item.badgeLevel
                      }
                      onPress={() =>
                        item.type === 'call'
                          ? navigation.navigate('CallsTab', {
                              screen: 'Calls',
                              params: { initialCallId: item.callId },
                            })
                          : navigation.navigate('AlertsTab')
                      }
                    />
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <NeedAssistanceCard onPress={() => navigation.navigate('SettingsTab')} />
          </View>
        </View>
      </ScrollView>
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
    content: {
      paddingTop: 12,
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
    skeletonOverlay: {
      position: 'absolute',
      top: 20,
      left: 0,
      right: 0,
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
