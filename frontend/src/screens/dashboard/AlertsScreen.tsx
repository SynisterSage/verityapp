import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { authorizedFetch } from '../../services/backend';
import AlertCard from '../../components/alerts/AlertCard';
import EmptyState from '../../components/common/EmptyState';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabase';

type AlertRow = {
  id: string;
  alert_type: string;
  status: string;
  created_at: string;
  payload: any;
  call_id: string | null;
  risk_label?: string | null;
  risk_level?: string | null;
};

export default function AlertsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const shimmer = useRef(new Animated.Value(0.6)).current;

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const data = await authorizedFetch('/alerts?status=pending&limit=25');
      const alerts = (data?.alerts ?? []) as AlertRow[];
      const callIds = alerts
        .map((alert) => alert.call_id)
        .filter((callId): callId is string => Boolean(callId));

      let feedbackMap = new Map<string, { feedback_status?: string | null; fraud_risk_level?: string | null }>();
      if (callIds.length > 0) {
        const { data: callRows } = await supabase
          .from('calls')
          .select('id, feedback_status, fraud_risk_level')
          .in('id', callIds);
        feedbackMap = new Map(
          (callRows ?? []).map((row) => [
            row.id,
            { feedback_status: row.feedback_status ?? null, fraud_risk_level: row.fraud_risk_level ?? null },
          ])
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
        return {
          ...alert,
          risk_label: riskLabel,
          risk_level: riskLevel,
        };
      });

      setAlerts(enriched);
    } catch {
      setAlerts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAlerts();
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

  const updateStatus = async (alertId: string, status: string) => {
    await authorizedFetch(`/alerts/${alertId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadAlerts();
  };

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <Text style={styles.title}>Alerts</Text>
      <View style={styles.listWrapper}>
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
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAlerts} />}
          contentContainerStyle={[
            styles.listContent,
            !showSkeleton && alerts.length === 0 && styles.listEmptyContent,
          ]}
          style={{ opacity: contentOpacity }}
          renderItem={({ item }) => {
            const riskLabel = item.risk_label ?? item.payload?.riskLevel ?? 'alert';
            const riskLevel = item.risk_level ?? item.payload?.riskLevel ?? 'unknown';
            const displayStatus =
              riskLabel.toLowerCase() === 'fraud'
                ? 'marked fraud'
                : riskLabel.toLowerCase() === 'safe'
                ? 'marked safe'
                : item.status;
            return (
              <AlertCard
                alertType={item.alert_type}
                status={displayStatus}
                createdAt={item.created_at}
                score={item.payload?.score}
                riskLevel={riskLevel}
                riskLabel={riskLabel}
                onPress={() =>
                  item.call_id
                    ? navigation.navigate('CallDetailModal', { callId: item.call_id })
                    : undefined
                }
              />
            );
          }}
          ListEmptyComponent={
            showSkeleton ? null : (
              <View style={styles.emptyStateWrap}>
                <EmptyState
                  icon="alert-circle-outline"
                  title="No alerts yet"
                  body="We will surface anything suspicious here as soon as it happens."
                />
              </View>
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f5f7fb',
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 120,
  },
  listEmptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  listWrapper: {
    flex: 1,
    position: 'relative',
  },
  emptyStateWrap: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  skeletonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  skeletonCard: {
    backgroundColor: '#121a26',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
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
});
