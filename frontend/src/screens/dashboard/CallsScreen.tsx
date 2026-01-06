import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';

type CallRow = {
  id: string;
  created_at: string;
  transcript: string | null;
  fraud_risk_level: string | null;
  fraud_score: number | null;
};

export default function CallsScreen({ navigation }: { navigation: any }) {
  const { session } = useAuth();
  const { activeProfile } = useProfile();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCalls = async () => {
    setError(null);
    if (!session || !activeProfile) {
      setCalls([]);
      return;
    }
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('calls')
      .select('id, created_at, transcript, fraud_risk_level, fraud_score')
      .eq('profile_id', activeProfile.id)
      .order('created_at', { ascending: false })
      .limit(25);
    if (fetchError) {
      setError(fetchError.message);
      setCalls([]);
    } else {
      setCalls(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCalls();
  }, [session, activeProfile]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recent Calls</Text>
      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadCalls} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('CallDetail', { callId: item.id })}
          >
            <Text style={styles.cardTitle}>
              {item.transcript ? item.transcript.slice(0, 80) : 'No transcript'}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{new Date(item.created_at).toLocaleString()}</Text>
              <Text style={styles.badge}>
                {(item.fraud_risk_level ?? 'unknown').toUpperCase()}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {error
              ? `Error: ${error}`
              : activeProfile
              ? 'No calls yet.'
              : 'Finish onboarding to view calls.'}
          </Text>
        }
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
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#202c3c',
  },
  cardTitle: {
    color: '#f1f4fa',
    fontSize: 14,
  },
  metaRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    color: '#8392ad',
    fontSize: 12,
  },
  badge: {
    color: '#8ab4ff',
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    color: '#8aa0c6',
    textAlign: 'center',
    marginTop: 40,
  },
});
