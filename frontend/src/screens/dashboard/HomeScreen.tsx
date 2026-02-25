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
import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';
import { useSupportContext } from '../../context/SupportContext';
import { navigateToSupportPortal } from '../../navigation/rootNavigator';

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
};

export default function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile } = useProfile();
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
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [alertsThisWeek, setAlertsThisWeek] = useState<number | null>(null);
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasInitialLoadCompleted, setHasInitialLoadCompleted] = useState(false);
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
      if (!session) {
        setLoading(false);
      }
      if (!silent) {
        setRefreshing(false);
      }
      return;
    }
    if (isRefresh && !silent) {
      setRefreshing(true);
    } else if (!silent) {
      setLoading(true);
    }
    try {
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
      const nextRecentCall = callRows[0] ?? null;
      const nextAlertsThisWeek = alertsRes.count ?? 0;
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
          };
        }),
      ]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3);

      // Apply the full snapshot together to avoid partial first-paint states.
      setRecentCall(nextRecentCall);
      setAlertsThisWeek(nextAlertsThisWeek);
      setBlockedCount(nextBlockedCount);
      setRecentActivity(activityItems);
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

  useEffect(() => {
    setRecentCall(null);
    setRecentActivity([]);
    setAlertsThisWeek(null);
    setBlockedCount(null);
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
  const waitingForProfile = Boolean(session) && !activeProfile;
  const showSkeleton = waitingForProfile || !hasInitialLoadCompleted;
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

  const triggerLightHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
  }, []);

  const handleSupportPress = useCallback(() => {
    triggerLightHaptic();
    navigateToSupportPortal();
  }, [triggerLightHaptic]);

  const hasHeroCall = Boolean(recentCall?.caller_number);
  const heroTitle = hasHeroCall
    ? formatPhoneNumber(recentCall?.caller_number, 'Recent Call')
    : hasTwilioNumber
    ? 'No calls yet'
    : waitingForProfile
    ? 'Loading…'
    : 'Missing #';
  const heroTranscript = recentCall?.transcript ?? (loading ? 'Loading…' : null);
  const heroIsHandledFraud = hasHeroCall && recentCall?.feedback_status === 'marked_fraud';
  const heroFraudLevel = heroIsHandledFraud
    ? undefined
    : recentCall?.feedback_status === 'marked_fraud'
    ? 'critical'
    : recentCall?.feedback_status === 'marked_safe'
    ? 'low'
    : recentCall?.fraud_risk_level;
  const heroBadgeLabel = heroIsHandledFraud
    ? 'Handled'
    : hasHeroCall && recentCall?.feedback_status === 'marked_safe'
    ? 'Safe'
    : undefined;
  const heroBadgeBackgroundColor = heroIsHandledFraud
    ? withOpacity(theme.colors.textDim, 0.2)
    : undefined;
  const heroBadgeTextColor = heroIsHandledFraud ? theme.colors.textDim : undefined;
  const heroSubtitleLabel = hasHeroCall
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
              onRefresh={() => loadStats(true)}
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
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Featured Event</Text>
              <RecentCallCard
                title={heroTitle}
                transcript={heroTranscript}
                createdAt={recentCall?.created_at}
                fraudLevel={heroFraudLevel}
                badgeLabel={heroBadgeLabel}
                badgeBackgroundColor={heroBadgeBackgroundColor}
                badgeTextColor={heroBadgeTextColor}
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
                          disabled={Boolean(item.viewOnly) && !isTrustedActivity}
                          badgeLevel={
                            item.badge === 'FRAUD'
                              ? 'critical'
                              : item.badge === 'SAFE'
                              ? 'low'
                              : item.badgeLevel
                          }
                          onPress={() => {
                            if (isTrustedActivity) {
                              navigation.navigate('CallsTab', {
                                screen: 'Calls',
                                params: { initialFilter: 'trusted' },
                              });
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
