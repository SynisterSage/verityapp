import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  AppStateStatus,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

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
  const [filter, setFilter] = useState<'all' | 'new' | 'critical'>('all');
  const [callNumberMap, setCallNumberMap] = useState<Record<string, string>>({});
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const menuAnim = useRef(new Animated.Value(0)).current;
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

  const loadAlerts = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      await loadContactNames();
      const data = await authorizedFetch('/alerts?status=pending&limit=25');
      const alerts = (data?.alerts ?? []) as AlertRow[];
      const callIds = alerts
        .map((alert) => alert.call_id)
        .filter((callId): callId is string => Boolean(callId));

      let feedbackMap = new Map<string, { feedback_status?: string | null; fraud_risk_level?: string | null }>();
      let numberMap: Record<string, string> = {};
      if (callIds.length > 0) {
        const { data: callRows } = await supabase
          .from('calls')
          .select('id, feedback_status, fraud_risk_level, caller_number')
          .in('id', callIds);
        feedbackMap = new Map(
          (callRows ?? []).map((row) => [
            row.id,
            { feedback_status: row.feedback_status ?? null, fraud_risk_level: row.fraud_risk_level ?? null },
          ])
        );
        numberMap = Object.fromEntries(
          (callRows ?? [])
            .filter((row) => row.caller_number)
            .map((row) => [row.id, row.caller_number as string])
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
      setCallNumberMap(numberMap);
    } catch {
      setAlerts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  useEffect(() => {
    // Close menu when the screen is refocused or left.
    return () => setShowFilterMenu(false);
  }, []);

  useEffect(() => {
    Animated.timing(menuAnim, {
      toValue: showFilterMenu ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [showFilterMenu, menuAnim]);

  useEffect(() => {
    const interval = isAppActive
      ? setInterval(() => {
          loadAlerts(true);
        }, 60000)
      : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAppActive]);

  useFocusEffect(
    useCallback(() => {
      loadAlerts(true);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      setShowFilterMenu(false);
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
  const sortedAlerts = useMemo(() => {
    const weight = (status?: string | null) => (status === 'resolved' ? 1 : 0);
    return [...alerts].sort((a, b) => {
      const wDiff = weight(a.status) - weight(b.status);
      if (wDiff !== 0) return wDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [alerts]);
  const filteredAlerts = useMemo(() => {
    if (filter === 'critical') {
      return sortedAlerts.filter((a) => (a.risk_level ?? '').toLowerCase() === 'critical');
    }
    if (filter === 'new') {
      return sortedAlerts.filter((a) => a.status !== 'resolved');
    }
    return sortedAlerts;
  }, [sortedAlerts, filter]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const active = nextState === 'active';
      setIsAppActive(active);
      if (active) {
        loadAlerts();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Alerts</Text>
        <View style={styles.filterWrapper}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilterMenu((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Text style={styles.filterButtonText}>
              {filter === 'all' ? 'All' : filter === 'new' ? 'New' : 'Critical'}
            </Text>
            <Ionicons
              name={showFilterMenu ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#cfe0ff"
            />
          </TouchableOpacity>
          {showFilterMenu ? (
            <>
              <TouchableOpacity
                style={styles.menuOverlay}
                activeOpacity={1}
                onPress={() => setShowFilterMenu(false)}
              />
              <Animated.View
                style={[
                  styles.filterMenu,
                  {
                    opacity: menuAnim,
                    transform: [
                      {
                        translateY: menuAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-4, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {(['all', 'new', 'critical'] as const).map((key, idx, arr) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.filterMenuItem, idx === arr.length - 1 && styles.filterMenuItemLast]}
                    onPress={() => {
                      setFilter(key);
                      setShowFilterMenu(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.filterMenuText,
                        filter === key && styles.filterMenuTextActive,
                      ]}
                    >
                      {key === 'all' ? 'All' : key === 'new' ? 'New' : 'Critical'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            </>
          ) : null}
        </View>
      </View>
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
          data={filteredAlerts}
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
            !showSkeleton && filteredAlerts.length === 0 && styles.listEmptyContent,
          ]}
          style={{ opacity: contentOpacity }}
          renderItem={({ item }) => {
            const isTrusted = item.alert_type === 'trusted';
            const riskLabel = isTrusted ? 'Trusted' : item.risk_label ?? item.payload?.riskLevel ?? 'alert';
            const riskLevel = isTrusted ? 'low' : item.risk_level ?? item.payload?.riskLevel ?? 'unknown';
            const callerNumber =
              (item.payload?.callerNumber as string | undefined) ||
              (item.payload?.caller_number as string | undefined) ||
              (item.call_id ? callNumberMap[item.call_id] : undefined);
            const callerName = callerNumber ? contactNames[callerNumber] : '';
            const title = isTrusted ? 'Trusted call' : item.alert_type;
            const nameOrNumber = callerName || callerNumber || 'Unknown caller';
            const subtitle = `${nameOrNumber} • Score ${item.payload?.score ?? '—'}`;
            return (
              <AlertCard
                alertType={title}
                status={item.status}
                createdAt={item.created_at}
                score={item.payload?.score}
                riskLevel={riskLevel}
                riskLabel={riskLabel}
                subtitle={subtitle}
                muted={item.status !== 'pending'}
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
                  title="No alerts"
                  body={
                    filter === 'critical'
                      ? 'No critical alerts right now.'
                      : filter === 'new'
                      ? 'No new alerts right now.'
                      : 'We will surface anything suspicious here as soon as it happens.'
                  }
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  filterWrapper: {
    position: 'relative',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#121a26',
    borderWidth: 1,
    borderColor: '#1f2a3a',
  },
  filterButtonText: {
    color: '#cfe0ff',
    fontWeight: '600',
    fontSize: 13,
  },
  filterMenu: {
    position: 'absolute',
    top: 34,
    right: 0,
    width: 120,
    backgroundColor: '#121a26',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2a3a',
    paddingVertical: 6,
    zIndex: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  filterMenuItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2a3a',
  },
  filterMenuItemLast: {
    borderBottomWidth: 0,
  },
  filterMenuText: {
    color: '#9fb0cc',
    fontWeight: '600',
  },
  filterMenuTextActive: {
    color: '#f5f7fb',
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
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
