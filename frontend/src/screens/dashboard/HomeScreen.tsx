import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { supabase } from '../../services/supabase';
import { authorizedFetch } from '../../services/backend';

type CallRow = {
  id: string;
  created_at: string;
  transcript: string | null;
  fraud_risk_level: string | null;
  fraud_score: number | null;
  caller_number: string | null;
};

type AlertRow = {
  id: string;
  created_at: string;
  alert_type: string;
  status: string;
  payload: any;
};

type ActivityItem =
  | { type: 'call'; created_at: string; label: string; badge: string; callId: string }
  | { type: 'alert'; created_at: string; label: string; badge: string };

export default function HomeScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile } = useProfile();
  const [recentCall, setRecentCall] = useState<CallRow | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [alertsThisWeek, setAlertsThisWeek] = useState<number | null>(null);
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const email = session?.user.email ?? 'Account';

  useEffect(() => {
    const loadStats = async () => {
      if (!activeProfile) {
        setRecentCall(null);
        setRecentActivity([]);
        setAlertsThisWeek(null);
        setBlockedCount(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const callsPromise = supabase
        .from('calls')
        .select('id, created_at, transcript, fraud_risk_level, fraud_score, caller_number')
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

      const activityItems: ActivityItem[] = [
        ...callRows.map((call) => ({
          type: 'call' as const,
          created_at: call.created_at,
          label: call.caller_number ?? 'Unknown caller',
          badge: call.fraud_risk_level ? call.fraud_risk_level.toUpperCase() : 'CALL',
          callId: call.id,
        })),
        ...alertRows.map((alert) => ({
          type: 'alert' as const,
          created_at: alert.created_at,
          label: 'Fraud alert',
          badge: (alert.payload?.riskLevel ?? 'alert').toString().toUpperCase(),
        })),
      ]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3);

      setRecentActivity(activityItems);
      setLoading(false);
    };

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

  const skeletonRows = useMemo(() => Array.from({ length: 3 }, (_, i) => `skeleton-${i}`), []);
  const showSkeleton = loading && !recentCall && recentActivity.length === 0;
  const contentOpacity = showSkeleton ? 0 : 1;

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <Text style={styles.title}>SafeCall</Text>
      <Text style={styles.subtitle}>{activeProfile?.first_name ?? email}</Text>

      <View style={styles.grid}>
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
            <TouchableOpacity
              style={styles.tile}
              onPress={() =>
                recentCall
                  ? navigation.navigate('CallsTab', {
                      screen: 'CallDetail',
                      params: { callId: recentCall.id },
                    })
                  : navigation.navigate('CallsTab')
              }
            >
              <Text style={styles.tileLabel}>Recent Call</Text>
            <Text style={styles.tileHint}>
              {recentCall?.transcript
                ? recentCall.transcript.slice(0, 72)
                : loading
                ? 'Loading…'
                : 'No calls yet'}
            </Text>
              {recentCall ? (
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>
                    {new Date(recentCall.created_at).toLocaleString()}
                  </Text>
                  <Text style={styles.badge}>
                    {(recentCall.fraud_risk_level ?? 'unknown').toUpperCase()}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>

            <View style={styles.statsRow}>
              <TouchableOpacity
                style={[styles.tile, styles.statTile]}
                onPress={() => navigation.navigate('AlertsTab')}
              >
                <Text style={styles.tileLabel}>Alerts {'\n'}This Week</Text>
                <Text style={styles.tileHint}>
                  {alertsThisWeek === null ? '—' : `${alertsThisWeek} alerts`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tile, styles.statTile]}
                onPress={() => navigation.navigate('SettingsTab', { screen: 'Blocklist' })}
              >
                <Text style={styles.tileLabel}>Blocked Numbers</Text>
                <Text style={styles.tileHint}>
                  {blockedCount === null ? '—' : `${blockedCount} blocked`}
                </Text>
              </TouchableOpacity>
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
                <Text style={styles.emptyActivity}>No activity yet.</Text>
              ) : (
                recentActivity.map((item) => (
                  <TouchableOpacity
                    key={`${item.type}-${item.created_at}`}
                    style={styles.activityRow}
                    onPress={() =>
                      item.type === 'call'
                        ? navigation.navigate('CallsTab', {
                            screen: 'CallDetail',
                            params: { callId: item.callId },
                          })
                        : navigation.navigate('AlertsTab')
                    }
                  >
                    <View>
                      <Text style={styles.activityLabel}>{item.label}</Text>
                      <Text style={styles.activityMeta}>
                        {new Date(item.created_at).toLocaleString()}
                      </Text>
                    </View>
                    <Text style={styles.activityBadge}>{item.badge}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        </View>
      </View>
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
  statTile: {
    flex: 1,
  },
  tile: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#202c3c',
  },
  tileLabel: {
    color: '#f5f7fb',
    fontWeight: '600',
    fontSize: 16,
  },
  tileHint: {
    color: '#8aa0c6',
    marginTop: 6,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    color: '#7f90ab',
    fontSize: 12,
  },
  badge: {
    color: '#8ab4ff',
    fontSize: 12,
    fontWeight: '600',
  },
  activitySection: {
    marginTop: 12,
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
    color: '#8ab4ff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyActivity: {
    color: '#8aa0c6',
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
  skeletonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
