import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { authorizedFetch } from '../../services/backend';

type AlertRow = {
  id: string;
  alert_type: string;
  status: string;
  created_at: string;
  payload: any;
};

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const shimmer = useRef(new Animated.Value(0.6)).current;

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const data = await authorizedFetch('/alerts?status=pending&limit=25');
      setAlerts(data?.alerts ?? []);
    } catch {
      setAlerts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAlerts();
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
          contentContainerStyle={styles.listContent}
          style={{ opacity: contentOpacity }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.alert_type.toUpperCase()}</Text>
              <Text style={styles.meta}>
                {new Date(item.created_at).toLocaleString()} • {item.status}
              </Text>
              <Text style={styles.body}>
                Score: {item.payload?.score ?? '—'} ({item.payload?.riskLevel ?? 'unknown'})
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => updateStatus(item.id, 'acknowledged')}>
                  <Text style={styles.link}>Acknowledge</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => updateStatus(item.id, 'resolved')}>
                  <Text style={styles.link}>Resolve</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={showSkeleton ? null : <Text style={styles.empty}>No alerts.</Text>}
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
  card: {
    backgroundColor: '#121a26',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    marginBottom: 12,
  },
  cardTitle: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  meta: {
    color: '#8aa0c6',
    marginTop: 6,
  },
  body: {
    color: '#d2daea',
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  link: {
    color: '#8ab4ff',
  },
  empty: {
    color: '#8aa0c6',
    textAlign: 'center',
    marginTop: 40,
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
