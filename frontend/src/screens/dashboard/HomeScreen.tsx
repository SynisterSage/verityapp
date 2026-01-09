import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { supabase } from '../../services/supabase';
import { authorizedFetch } from '../../services/backend';
import RecentCallCard from '../../components/home/RecentCallCard';
import StatTile from '../../components/home/StatTile';
import ActivityRow from '../../components/home/ActivityRow';
import EmptyState from '../../components/common/EmptyState';

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
  | { type: 'call'; created_at: string; label: string; badge: string; badgeLevel?: string; callId: string }
  | { type: 'alert'; created_at: string; label: string; badge: string; badgeLevel?: string };

type StatTile = {
  key: string;
  label: string;
  value: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export default function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile } = useProfile();
  const [recentCall, setRecentCall] = useState<CallRow | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [alertsThisWeek, setAlertsThisWeek] = useState<number | null>(null);
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const scrollRef = useRef<ScrollView>(null);
  const email = session?.user.email ?? 'Account';
  const hasTwilioNumber = Boolean(activeProfile?.twilio_virtual_number);
  const loadStats = async (isRefresh = false) => {
    if (!activeProfile) {
      setRecentCall(null);
      setRecentActivity([]);
      setAlertsThisWeek(null);
      setBlockedCount(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (isRefresh) {
      setRefreshing(true);
    } else {
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
          return {
            type: 'call' as const,
            created_at: call.created_at,
            label: call.caller_number ?? 'Unknown caller',
            badge: badgeLabel,
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
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadStats();
  }, [activeProfile]);

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
      label: 'Weekly Alerts',
      value: alertsThisWeek === null ? '—' : `${alertsThisWeek}`,
      caption: 'alerts',
      icon: 'alert-circle',
      onPress: () => navigation.navigate('AlertsTab'),
    },
    {
      key: 'blocked',
      label: 'Blocked Numbers',
      value: blockedCount === null ? '—' : `${blockedCount}`,
      caption: 'blocked',
      icon: 'ban',
      onPress: () => navigation.navigate('SettingsTab', { screen: 'Blocklist' }),
    },
  ];

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <Text style={styles.title}>SafeCall</Text>
      <Text style={styles.subtitle}>{activeProfile?.first_name ?? email}</Text>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadStats(true)}
            tintColor="#8ab4ff"
            colors={['#8ab4ff']}
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
          <>
            <RecentCallCard
              transcript={
                recentCall?.transcript ?? (loading ? 'Loading…' : null)
              }
              createdAt={recentCall?.created_at}
              fraudLevel={
                recentCall?.feedback_status === 'marked_fraud'
                  ? 'critical'
                  : recentCall?.feedback_status === 'marked_safe'
                  ? 'low'
                  : recentCall?.fraud_risk_level
              }
              badgeLabel={
                recentCall?.feedback_status === 'marked_fraud'
                  ? 'Fraud'
                  : recentCall?.feedback_status === 'marked_safe'
                  ? 'Safe'
                  : undefined
              }
              emptyText={
                hasTwilioNumber
                  ? 'No calls recorded yet.'
                  : 'Add a SafeCall number to start recording calls.'
              }
              onPress={() =>
                recentCall
                  ? navigation.navigate('CallsTab', {
                      screen: 'CallDetail',
                      params: { callId: recentCall.id },
                    })
                  : navigation.navigate('CallsTab')
              }
            />

            <View style={styles.statsRow}>
              {statTiles.map((tile) => (
                <StatTile
                  key={tile.key}
                  label={tile.label}
                  value={tile.value}
                  caption={tile.caption}
                  icon={tile.icon}
                  onPress={tile.onPress}
                />
              ))}
            </View>

            <View style={styles.activitySection}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              {loading && recentActivity.length === 0 ? (
                <View>
                  {skeletonRows.map((key) => (
                    <Animated.View key={`activity-${key}`} style={[styles.activityRow, styles.skeletonCard, { opacity: shimmer }]}>
                      <View>
                        <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                        <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
                      </View>
                      <View style={[styles.skeletonPill]} />
                    </Animated.View>
                  ))}
                </View>
              ) : recentActivity.length === 0 ? (
                <View style={styles.emptyStateWrap}>
                  {hasTwilioNumber ? (
                    <EmptyState
                      icon="pulse-outline"
                      title="No activity yet"
                      body="Calls and alerts will show up here once they start."
                    />
                  ) : (
                    <EmptyState
                      icon="call-outline"
                      title="Connect a SafeCall number"
                      body="Add your virtual number to start receiving and reviewing calls."
                      ctaLabel="Set up number"
                      onPress={() => navigation.navigate('SettingsTab')}
                    />
                  )}
                </View>
              ) : (
                recentActivity.map((item) => (
                  <ActivityRow
                    key={`${item.type}-${item.created_at}`}
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
                            screen: 'CallDetail',
                            params: { callId: item.callId },
                          })
                        : navigation.navigate('AlertsTab')
                    }
                  />
                ))
              )}
            </View>
          </>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f5f7fb',
  },
  subtitle: {
    color: '#8aa0c6',
    marginTop: 6,
  },
  grid: {
    marginTop: 24,
    gap: 18,
    position: 'relative',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  activitySection: {
    marginTop: 24,
    gap: 12,
  },
  sectionTitle: {
    color: '#98a7c2',
    fontWeight: '600',
    marginBottom: 4,
  },
  activityRow: {
    backgroundColor: '#121a26',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202c3c',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activityIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#1b2634',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityLabel: {
    color: '#e4ebf7',
    fontWeight: '600',
  },
  activityMeta: {
    color: '#8aa0c6',
    marginTop: 4,
    fontSize: 12,
  },
  activityBadge: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    letterSpacing: 0.5,
  },
  emptyStateWrap: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  listContent: {
    paddingBottom: 120,
  },
  listWrapper: {
    flex: 1,
    position: 'relative',
  },
  skeletonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  skeletonCard: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
  },
  skeletonLine: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#1c2636',
    marginTop: 10,
  },
  skeletonLineShort: {
    width: '45%',
    marginTop: 2,
  },
  skeletonLineTiny: {
    width: '35%',
  },
  skeletonPill: {
    height: 12,
    width: 54,
    borderRadius: 999,
    backgroundColor: '#1c2636',
  },
});
