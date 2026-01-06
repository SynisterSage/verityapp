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
import AsyncStorage from '@react-native-async-storage/async-storage';

import { authorizedFetch } from '../../services/backend';
import AlertCard from '../../components/alerts/AlertCard';
import EmptyState from '../../components/common/EmptyState';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../services/supabase';
import { useProfile } from '../../context/ProfileContext';

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
  const { activeProfile } = useProfile();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const listRef = useRef<FlatList<AlertRow>>(null);

  const loadContactNames = async () => {
    if (!activeProfile) {
      setContactNames({});
      return;
    }
    const raw = await AsyncStorage.getItem(`trusted_contacts_map:${activeProfile.id}`);
    if (!raw) {
      setContactNames({});
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, { name?: string; numbers?: string[] } | string[]>;
      const map: Record<string, string> = {};
      Object.values(parsed).forEach((entry) => {
        if (Array.isArray(entry)) {
          entry.forEach((number) => {
            if (number) {
              map[number] = map[number] ?? 'Trusted contact';
            }
          });
        } else if (entry && typeof entry === 'object') {
          const name = entry.name ?? 'Trusted contact';
          const numbers = Array.isArray(entry.numbers) ? entry.numbers : [];
          numbers.forEach((number) => {
            if (number) {
              map[number] = name;
            }
          });
        }
      });
      setContactNames(map);
    } catch {
      setContactNames({});
    }
  };

  const loadAlerts = async () => {
    setLoading(true);
    try {
      await loadContactNames();
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
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
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
          ref={listRef}
          data={alerts}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadAlerts}
              tintColor="#8ab4ff"
              colors={['#8ab4ff']}
            />
          }
          indicatorStyle="white"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          contentContainerStyle={[
            styles.listContent,
            !showSkeleton && alerts.length === 0 && styles.listEmptyContent,
          ]}
          style={{ opacity: contentOpacity }}
          renderItem={({ item }) => {
            const isTrusted = item.alert_type === 'trusted';
            const riskLabel = isTrusted ? 'Trusted' : item.risk_label ?? item.payload?.riskLevel ?? 'alert';
            const riskLevel = isTrusted ? 'low' : item.risk_level ?? item.payload?.riskLevel ?? 'unknown';
            const callerNumber = item.payload?.callerNumber as string | undefined;
            const callerName = callerNumber ? contactNames[callerNumber] : '';
            const displayStatus = isTrusted
              ? 'trusted contact'
              : riskLabel.toLowerCase() === 'fraud'
                ? 'blocked'
                : riskLabel.toLowerCase() === 'safe'
                ? 'marked safe'
                : item.status;
            const title = isTrusted ? 'Trusted call' : item.alert_type;
            const subtitle = isTrusted
              ? callerName || callerNumber || 'Trusted contact'
              : undefined;
            return (
              <AlertCard
                alertType={title}
                status={displayStatus}
                createdAt={item.created_at}
                score={item.payload?.score}
                riskLevel={riskLevel}
                riskLabel={riskLabel}
                subtitle={subtitle}
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
