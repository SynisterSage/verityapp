import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  AppStateStatus,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { subscribeToCallUpdates } from '../../utils/callEvents';
import RecentCallCard from '../../components/home/RecentCallCard';
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

export default function CallsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile } = useProfile();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const listRef = useRef<FlatList<CallRow>>(null);

  const loadCalls = useCallback(async (silent = false) => {
    setError(null);
    if (!session || !activeProfile) {
      setCalls([]);
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
    }
    const { data, error: fetchError } = await supabase
      .from('calls')
      .select('id, created_at, transcript, fraud_risk_level, fraud_score, caller_number, feedback_status')
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
  }, [session, activeProfile]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  useEffect(() => {
    const interval = isAppActive
      ? setInterval(() => {
          loadCalls(true);
        }, 60000)
      : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAppActive, loadCalls]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const active = nextState === 'active';
      setIsAppActive(active);
      if (active) {
        loadCalls();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [loadCalls]);

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
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, [])
  );

  useEffect(() => {
    const unsubscribe = subscribeToCallUpdates(() => {
      loadCalls(true);
    });
    return unsubscribe;
  }, [loadCalls]);

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
          ref={listRef}
          data={calls}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadCalls}
              tintColor="#8ab4ff"
              colors={['#8ab4ff']}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            !showSkeleton && calls.length === 0 && !error && styles.listEmptyContent,
          ]}
          style={{ opacity: contentOpacity }}
          ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
          renderItem={({ item }) => {
            const feedback = item.feedback_status ?? '';
            const badgeLabel =
              feedback === 'marked_fraud'
                ? 'Fraud'
                : feedback === 'marked_safe'
                ? 'Safe'
                : undefined;
            const badgeLevel =
              feedback === 'marked_fraud'
                ? 'critical'
                : feedback === 'marked_safe'
                ? 'low'
                : item.fraud_risk_level;
            return (
              <RecentCallCard
                title={item.caller_number ?? 'Unknown caller'}
                transcript={item.transcript}
                createdAt={item.created_at}
                fraudLevel={badgeLevel}
                badgeLabel={badgeLabel}
                emptyText="No transcript"
                maxLength={80}
                onPress={() => {
                  const rootNavigator = navigation.getParent()?.getParent();
                  if (rootNavigator?.navigate) {
                    rootNavigator.navigate('CallDetailModal', { callId: item.id, compact: false });
                  } else {
                    navigation.navigate('CallDetail', { callId: item.id });
                  }
                }}
              />
            );
          }}
          ListEmptyComponent={
            showSkeleton ? null : error ? (
              <Text style={styles.empty}>Error: {error}</Text>
            ) : activeProfile ? (
              <View style={styles.emptyStateWrap}>
                <EmptyState
                  icon="call-outline"
                  title="No calls yet"
                  body="Incoming calls will appear here once they are recorded."
                />
              </View>
            ) : (
              <Text style={styles.empty}>Finish onboarding to view calls.</Text>
            )
          }
        />
      </View>
      <View style={styles.bottomMask} pointerEvents="none" />
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
  empty: {
    color: '#8aa0c6',
    textAlign: 'center',
    marginTop: 40,
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
  bottomMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    backgroundColor: '#0b111b',
  },
  listSeparator: {
    height: 12,
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
