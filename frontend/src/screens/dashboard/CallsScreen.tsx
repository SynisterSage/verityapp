import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SectionList,
  SectionBase,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  Pressable,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { supabase } from '../../services/supabase';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { subscribeToCallUpdates } from '../../utils/callEvents';
import EmptyState from '../../components/common/EmptyState';
import CallFilter, { CallFilterKey } from '../../components/calls/CallFilter';
import { formatPhoneNumber } from '../../utils/formatPhoneNumber';
import { withOpacity } from '../../utils/color';
import { useTheme } from '../../context/ThemeContext';
import DashboardHeader from '../../components/common/DashboardHeader';
import type { AppTheme } from '../../theme/tokens';
import type { CallsStackParamList } from '../../navigation/types';

type CallRow = {
  id: string;
  created_at: string;
  transcript: string | null;
  fraud_risk_level: string | null;
  fraud_score: number | null;
  caller_number: string | null;
  feedback_status?: string | null;
};

type CallSection = SectionBase<CallRow> & {
  title: string;
};

const formatSectionTitle = (title: string) => {
  if (title === 'Today') return 'Today';
  if (title === 'Yesterday') return 'Yesterday';
  return 'Earlier';
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const determineStatus = (call: CallRow, theme: AppTheme) => {
  const feedback = (call.feedback_status ?? '').toLowerCase();
  const level = (call.fraud_risk_level ?? '').toLowerCase();

  if (feedback === 'marked_safe' || level === 'safe') {
    return { label: 'Safe', color: theme.colors.success, group: 'verified' as const };
  }
  if (feedback === 'marked_fraud' || level === 'fraud' || level === 'critical') {
    return { label: 'Risk', color: theme.colors.danger, group: 'risk' as const };
  }
  if (feedback === 'blocked' || level === 'blocked') {
    return { label: 'Blocked', color: theme.colors.danger, group: 'risk' as const };
  }
  if (level === 'warning') {
    return { label: 'Warning', color: theme.colors.warning, group: 'risk' as const };
  }
  return { label: 'Call', color: theme.colors.textMuted, group: 'all' as const };
};

const formatTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

type CallRecordItemProps = {
  title: string;
  timeLabel: string;
  statusLabel: string;
  statusColor: string;
  hasTranscript: boolean;
  onPress: () => void;
};

function CallRecordItem({
  title,
  timeLabel,
  statusLabel,
  statusColor,
  hasTranscript,
  onPress,
}: CallRecordItemProps) {
  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.callItem,
        pressed && styles.callItemPressed,
      ]}
    >
      <View style={styles.callRow}>
        <View style={[styles.callIcon, { borderColor: 'transparent' }]}>
          <View
            style={[
              styles.callIconStack,
              { backgroundColor: withOpacity(statusColor, 0.18) },
            ]}
          >
            <Ionicons name="call-outline" size={22} color={statusColor} />
          </View>
          {hasTranscript && (
            <View style={[styles.transcriptBadge, { backgroundColor: statusColor }]}>
              <Ionicons name="chatbubble-ellipses" size={11} color="#fff" />
            </View>
          )}
        </View>
        <View style={styles.callText}>
          <Text style={styles.callTitle}>{title}</Text>
          <Text style={styles.callTimestamp}>{timeLabel}</Text>
        </View>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: withOpacity(statusColor, 0.15) },
          ]}
        >
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function CallsScreen({
  navigation,
  route,
}: {
  navigation: NativeStackNavigationProp<CallsStackParamList, 'Calls'>;
  route: RouteProp<CallsStackParamList, 'Calls'>;
}) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile } = useProfile();
  const { theme } = useTheme();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CallFilterKey>('all');
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const listRef = useRef<SectionList<CallRow, CallSection> | null>(null);
  const initialCallIdRef = useRef<string | null>(null);

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
    initialCallIdRef.current = route.params?.initialCallId ?? null;
  }, [route.params?.initialCallId]);

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
    const unsubscribe = subscribeToCallUpdates(() => {
      loadCalls(true);
    });
    return unsubscribe;
  }, [loadCalls]);

  const filteredCalls = useMemo(() => {
    if (filter === 'all') {
      return calls;
    }
    return calls.filter((call) => {
      const status = determineStatus(call, theme);
      return status.group === filter;
    });
  }, [calls, filter, theme]);

  const sortedCalls = useMemo(() => {
    return [...filteredCalls].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [filteredCalls]);

const sections = useMemo<CallSection[]>(() => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const buckets: Record<string, CallRow[]> = { Today: [], Yesterday: [], Older: [] };

  sortedCalls.forEach((call) => {
    const created = new Date(call.created_at);
    if (isSameDay(created, today)) {
      buckets.Today.push(call);
    } else if (isSameDay(created, yesterday)) {
      buckets.Yesterday.push(call);
    } else {
      buckets.Older.push(call);
    }
  });

  const groupSections = Object.entries(buckets)
    .filter(([, data]) => data.length > 0)
    .map(([title, data]) => ({ title, data }));

  return groupSections;
}, [sortedCalls]);

  useFocusEffect(
    useCallback(() => {
      if (initialCallIdRef.current) {
        const callId = initialCallIdRef.current;
        const rootNavigator = navigation.getParent()?.getParent();
        if (rootNavigator?.navigate) {
          rootNavigator.navigate('CallDetailModal', {
            callId,
            compact: false,
          });
        } else {
          navigation.navigate('CallDetail', { callId });
        }
        initialCallIdRef.current = null;
        navigation.setParams({ initialCallId: undefined });
      }
    }, [navigation])
  );

  const handleCallPress = useCallback(
    (call: CallRow) => {
      const rootNavigator = navigation.getParent()?.getParent();
      if (rootNavigator?.navigate) {
        rootNavigator.navigate('CallDetailModal', { callId: call.id, compact: false });
      } else {
        navigation.navigate('CallDetail', { callId: call.id });
      }
    },
    [navigation]
  );

  const openSettingsTab = useCallback(() => {
    navigation.getParent()?.navigate('SettingsTab');
  }, [navigation]);

  const renderCallItem = useCallback(
    ({ item }: { item: CallRow }) => {
      const status = determineStatus(item, theme);
      const title = formatPhoneNumber(item.caller_number, 'Unknown caller');
      return (
        <CallRecordItem
          title={title}
          timeLabel={formatTime(item.created_at)}
          statusLabel={status.label}
          statusColor={status.color}
          hasTranscript={Boolean(item.transcript)}
          onPress={() => handleCallPress(item)}
        />
      );
    },
    [handleCallPress, theme]
  );

  const renderSectionHeader = ({ section }: { section: CallSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{formatSectionTitle(section.title)}</Text>
    </View>
  );

  const showSkeleton = loading && calls.length === 0;
  const emptyStateMessage = error
    ? error
    : filter === 'verified'
    ? 'No verified calls yet.'
    : filter === 'risk'
    ? 'No risk calls found.'
    : 'No calls recorded yet.';

  const headerCount = filteredCalls.length;

  const bottomGap = Math.max(insets.bottom, 0) + 20;

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          paddingTop: Math.max(28, insets.top + 12),
          paddingBottom: bottomGap,
          paddingHorizontal: 24,
        },
      ]}
      edges={['bottom']}
    >
      <DashboardHeader
        title="Recent calls"
        subtitle={`${headerCount} calls logged`}
        align="left"
      />
      <View style={styles.filterBar}>
        <CallFilter value={filter} onChange={setFilter} />
      </View>
      <SectionList<CallRow, CallSection>
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderCallItem}
        renderSectionHeader={renderSectionHeader}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        style={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => loadCalls(true)}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
            progressBackgroundColor={theme.colors.accent}
            style={{ backgroundColor: theme.colors.accent }}
          />
        }
        contentContainerStyle={[
          styles.content,
          {
            flexGrow: 1,
            paddingBottom: bottomGap + 40,
          },
        ]}
        ListFooterComponentStyle={styles.footer}
        ListEmptyComponent={
          showSkeleton ? (
            <View style={styles.skeletonList}>
              {[...Array(3)].map((_, idx) => (
                <View key={idx} style={styles.skeletonCard} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyStateWrap}>
              <EmptyState
                icon="call-outline"
                title={emptyStateMessage}
                body="We will surface calls here as soon as they arrive."
              />
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f141d',
  },
  list: {
    flex: 1,
  },
  content: {
    paddingTop: 12,
  },
  filterBar: {
    marginTop: 20,
    marginBottom: 12,
    width: '100%',
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 12,
  },
  sectionHeaderText: {
    color: '#8aa0c6',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  callItem: {
    backgroundColor: '#121a26',
    borderRadius: 32,
    padding: 20,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  callItemPressed: {
    transform: [{ scale: 0.98 }],
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  callIcon: {
    marginRight: 16,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  callIconStack: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcriptBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0f141d',
  },
  callText: {
    flex: 1,
  },
  callTitle: {
    color: '#f5f7fb',
    fontSize: 18,
    fontWeight: '700',
  },
  callTimestamp: {
    color: '#8aa0c6',
    marginTop: 4,
    fontSize: 14,
  },
  statusPill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  emptyStateWrap: {
    marginTop: 8,
    alignItems: 'stretch',
    paddingHorizontal: 0,
  },
  skeletonList: {
    marginTop: 24,
  },
  skeletonCard: {
    height: 82,
    borderRadius: 32,
    backgroundColor: '#121a26',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  footer: {
    marginTop: 24,
    paddingBottom: 60,
  },
});
