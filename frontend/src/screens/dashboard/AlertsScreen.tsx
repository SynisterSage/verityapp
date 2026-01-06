import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { authorizedFetch } from '../../services/backend';

type AlertRow = {
  id: string;
  alert_type: string;
  status: string;
  created_at: string;
  payload: any;
};

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(false);

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

  const updateStatus = async (alertId: string, status: string) => {
    await authorizedFetch(`/alerts/${alertId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadAlerts();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alerts</Text>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAlerts} />}
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
        ListEmptyComponent={<Text style={styles.empty}>No alerts.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f5f7fb',
    marginBottom: 16,
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
});
