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

import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';

type CallRow = {
  id: string;
  created_at: string;
  transcript: string | null;
  fraud_risk_level: string | null;
  fraud_score: number | null;
  caller_number: string | null;
};

export default function CallsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile } = useProfile();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shimmer = useRef(new Animated.Value(0.6)).current;

  const loadCalls = async () => {
    setError(null);
    if (!session || !activeProfile) {
      setCalls([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('calls')
      .select('id, created_at, transcript, fraud_risk_level, fraud_score, caller_number')
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

  const skeletonRows = useMemo(() => Array.from({ length: 4 }, (_, i) => `skeleton-${i}`), []);
  const showSkeleton = loading && calls.length === 0 && !error;
  const contentOpacity = showSkeleton ? 0 : 1;

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <Text style={styles.title}>Recent Calls</Text>
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
          data={calls}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadCalls} />}
          contentContainerStyle={styles.listContent}
          style={{ opacity: contentOpacity }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('CallDetail', { callId: item.id })}
            >
              <Text style={styles.cardTitle}>{item.caller_number ?? 'Unknown caller'}</Text>
              <Text style={styles.cardSubtitle}>
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
            showSkeleton ? null : (
              <Text style={styles.empty}>
                {error
                  ? `Error: ${error}`
                  : activeProfile
                  ? 'No calls yet.'
                  : 'Finish onboarding to view calls.'}
              </Text>
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
    fontSize: 15,
    fontWeight: '600',
  },
  cardSubtitle: {
    color: '#8aa0c6',
    marginTop: 6,
    fontSize: 13,
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
