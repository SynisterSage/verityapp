import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Modal,
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
import * as Haptics from 'expo-haptics';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { authorizedFetch } from '../../services/backend';
import { supabase } from '../../services/supabase';

import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { subscribeToCallUpdates } from '../../utils/callEvents';
import EmptyState from '../../components/common/EmptyState';
import CallFilter, { CallFilterKey } from '../../components/calls/CallFilter';
import { formatPhoneNumber } from '../../utils/formatPhoneNumber';
import { withOpacity } from '../../utils/color';
import { useTheme } from '../../context/ThemeContext';
import DashboardHeader from '../../components/common/DashboardHeader';
import { getRiskStyles, getRiskSeverity } from '../../utils/risk';
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
  feedback_at?: string | null;
};

type CallSection = SectionBase<CallRow> & {
  title: string;
};

const formatSectionTitle = (title: string) => {
  if (title === 'Today') return 'Today';
  if (title === 'Yesterday') return 'Yesterday';
  if (title === 'Handled') return 'Handled';
  if (title === 'Archived') return 'Archived';
  return 'Earlier';
};

const handledStatuses = new Set(['marked_safe', 'marked_fraud']);

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const determineStatus = (call: CallRow, theme: AppTheme) => {
  const feedback = (call.feedback_status ?? '').toLowerCase();
  const level = (call.fraud_risk_level ?? '').toLowerCase();
  const severity = getRiskSeverity(call.fraud_risk_level);
  const severityStyles = getRiskStyles(call.fraud_risk_level);
  const handledColor = theme.colors.textDim;

  if (handledStatuses.has(feedback)) {
    const label = feedback === 'marked_fraud' ? 'Fraud' : 'Safe';
    const group = feedback === 'marked_fraud' ? 'risk' : 'verified';
    return { label, color: handledColor, group };
  }
  if (feedback === 'archived') {
    return { label: 'Archived', color: handledColor, group: 'all' as const };
  }
  if (level === 'safe') {
    return { label: 'Safe', color: theme.colors.success, group: 'verified' as const };
  }
  if (feedback === 'blocked' || level === 'blocked') {
    return { label: 'Blocked', color: theme.colors.danger, group: 'risk' as const };
  }
  if (level === 'warning') {
    return { label: 'Warning', color: theme.colors.warning, group: 'risk' as const };
  }
  if (severity === 'critical' || severity === 'high' || severity === 'medium') {
    const severityLabel = `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
    return { label: severityLabel, color: severityStyles.accent, group: 'risk' as const };
  }
  if (severity === 'low') {
    return { label: 'Low', color: severityStyles.accent, group: 'all' as const };
  }
  return { label: 'Call', color: theme.colors.textMuted, group: 'all' as const };
};

const formatTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const showYear = now.getFullYear() !== date.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(showYear ? { year: 'numeric' } : {}),
  });
};

type CallRecordItemProps = {
  title: string;
  timeLabel: string;
  statusLabel: string;
  statusColor: string;
  hasTranscript: boolean;
  onPress: () => void;
  isMuted?: boolean;
  onLongPress?: () => void;
  variant?: 'default' | 'handled' | 'archived';
};

function CallRecordItem({
  title,
  timeLabel,
  statusLabel,
  statusColor,
  hasTranscript,
  onPress,
  isMuted = false,
  onLongPress,
  variant = 'default',
}: CallRecordItemProps) {
  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      delayLongPress={400}
    style={({ pressed }) => [
      styles.callItem,
      isMuted && styles.callItemMuted,
      variant === 'handled' && styles.callItemHandled,
      variant === 'archived' && styles.callItemArchived,
      pressed && styles.callItemPressed,
    ]}
  >
      <View style={styles.callRow}>
        <View style={[styles.callIcon, { borderColor: 'transparent' }]}>
          <View
            style={[
              styles.callIconStack,
              { backgroundColor: withOpacity(statusColor, 0.18) },
              variant === 'handled' && styles.callIconStackHandled,
              variant === 'archived' && styles.callIconStackArchived,
              isMuted && styles.callIconStackMuted,
            ]}
          >
            <Ionicons
              name="call-outline"
              size={22}
              color={statusColor}
              style={isMuted ? styles.callIconMuted : undefined}
            />
          </View>
          {hasTranscript && (
            <View style={[styles.transcriptBadge, { backgroundColor: statusColor }]}>
              <Ionicons name="chatbubble-ellipses" size={11} color="#fff" />
            </View>
          )}
        </View>
        <View style={styles.callText}>
          <Text style={[styles.callTitle, isMuted && styles.callTitleMuted]}>{title}</Text>
          <Text style={[styles.callTimestamp, isMuted && styles.callTimestampMuted]}>
            {timeLabel}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: withOpacity(statusColor, 0.15) },
            variant === 'handled' && styles.statusPillHandled,
            variant === 'archived' && styles.statusPillArchived,
            isMuted && styles.statusPillMuted,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: statusColor },
              isMuted && styles.statusTextMuted,
            ]}
          >
            {statusLabel}
          </Text>
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
  const [refreshing, setRefreshing] = useState(false);
  const [trayCall, setTrayCall] = useState<CallRow | null>(null);
  const [isTrayMounted, setIsTrayMounted] = useState(false);
  const trayAnim = useRef(new Animated.Value(0)).current;
  const [trayProcessing, setTrayProcessing] = useState(false);
  const [activeTrayAction, setActiveTrayAction] = useState<'archive' | 'unarchive' | 'delete' | null>(null);

  const loadCalls = useCallback(async (silent = false) => {
    setError(null);
    if (!session || !activeProfile) {
      setCalls([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!silent) {
      setLoading(true);
    }
    const { data, error: fetchError } = await supabase
      .from('calls')
      .select('id, created_at, transcript, fraud_risk_level, fraud_score, caller_number, feedback_status, feedback_at')
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
    setRefreshing(false);
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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCalls(true);
  }, [loadCalls]);

  const showTray = useCallback((call: CallRow) => {
    setTrayCall(call);
    setIsTrayMounted(true);
    trayAnim.setValue(0);
    Animated.timing(trayAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [trayAnim]);

  const hideTray = useCallback(() => {
    void Haptics.selectionAsync();
    Animated.timing(trayAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsTrayMounted(false);
      setTrayCall(null);
    });
  }, [trayAnim]);

  const canOpenTray = useCallback((call: CallRow) => {
    const feedback = (call.feedback_status ?? '').toLowerCase();
    return handledStatuses.has(feedback) || feedback === 'archived';
  }, []);

  const handleTrayLongPress = useCallback(
    (call: CallRow) => {
      const feedback = (call.feedback_status ?? '').toLowerCase();
      if (!handledStatuses.has(feedback) && feedback !== 'archived') {
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showTray(call);
    },
    [showTray]
  );

  const toggleArchiveCall = useCallback(async () => {
    if (!trayCall) return;
    setTrayProcessing(true);
    const isArchived = (trayCall.feedback_status ?? '').toLowerCase() === 'archived';
    setActiveTrayAction(isArchived ? 'unarchive' : 'archive');
    try {
      await authorizedFetch(`/calls/${trayCall.id}/feedback`, {
        method: 'PATCH',
        body: JSON.stringify({ status: isArchived ? 'reviewed' : 'archived' }),
      });
      await loadCalls();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      hideTray();
    } catch (err) {
      Alert.alert('Archive failed', 'We could not archive the call. Please try again.');
    } finally {
      setTrayProcessing(false);
      setActiveTrayAction(null);
    }
  }, [trayCall, hideTray, loadCalls]);

  const deleteCall = useCallback(async () => {
    if (!trayCall) return;
    setTrayProcessing(true);
    setActiveTrayAction('delete');
    try {
      await authorizedFetch(`/calls/${trayCall.id}`, { method: 'DELETE' });
      await loadCalls();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      hideTray();
    } catch (err) {
      Alert.alert('Delete failed', 'We could not delete the call. Please try again.');
    } finally {
      setTrayProcessing(false);
      setActiveTrayAction(null);
    }
  }, [trayCall, hideTray, loadCalls]);

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
  const handled: CallRow[] = [];
  const archived: CallRow[] = [];
  const archivedStatuses = new Set(['archived']);

  sortedCalls.forEach((call) => {
    const feedback = (call.feedback_status ?? '').toLowerCase();
    if (archivedStatuses.has(feedback)) {
      archived.push(call);
      return;
    }
    if (handledStatuses.has(feedback)) {
      handled.push(call);
      return;
    }
    const created = new Date(call.created_at);
    if (isSameDay(created, today)) {
      buckets.Today.push(call);
    } else if (isSameDay(created, yesterday)) {
      buckets.Yesterday.push(call);
    } else {
      buckets.Older.push(call);
    }
  });

  const orderedBuckets = [
    { title: 'Today', data: buckets.Today },
    { title: 'Yesterday', data: buckets.Yesterday },
    { title: 'Older', data: buckets.Older },
  ];

  const sections = orderedBuckets
    .filter((bucket) => bucket.data.length > 0)
    .map(({ title, data }) => ({ title, data }));

  if (handled.length > 0) {
    sections.push({ title: 'Handled', data: handled });
  }

  if (archived.length > 0) {
    sections.push({ title: 'Archived', data: archived });
  }

  return sections;
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
    ({ item, section }: { item: CallRow; section: CallSection }) => {
      const status = determineStatus(item, theme);
      const title = formatPhoneNumber(item.caller_number, 'Unknown caller');
      const feedback = (item.feedback_status ?? '').toLowerCase();
      const isMuted =
        feedback === 'marked_safe' || feedback === 'marked_fraud' || feedback === 'archived';
      const shouldShowDate =
        section.title === 'Handled' || section.title === 'Older' || section.title === 'Archived';
      const timestampSource =
        section.title === 'Handled' ? item.feedback_at ?? item.created_at : item.created_at;
      const time = formatTime(timestampSource);
      const dateLabel = shouldShowDate ? formatDateLabel(timestampSource) : '';
      const timeLabel = dateLabel ? `${time} · ${dateLabel}` : time;
      return (
        <CallRecordItem
          title={title}
          timeLabel={timeLabel}
          statusLabel={status.label}
          statusColor={status.color}
          hasTranscript={Boolean(item.transcript)}
          onPress={() => handleCallPress(item)}
          onLongPress={canOpenTray(item) ? () => handleTrayLongPress(item) : undefined}
          isMuted={isMuted}
        />
      );
    },
    [handleCallPress, theme, handleTrayLongPress]
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
  const refreshAccent = theme.colors.accent;
  const refreshAccentPortion = withOpacity(refreshAccent, 0.18);
  const trayTranslateY = trayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
    extrapolate: 'clamp',
  });
  const trayBackdropOpacity = trayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.45],
    extrapolate: 'clamp',
  });
  const isTrayArchived = (trayCall?.feedback_status ?? '').toLowerCase() === 'archived';
  const primaryActionLabel = isTrayArchived
    ? trayProcessing && activeTrayAction === 'unarchive'
      ? 'Working…'
      : 'Unarchive this call'
    : trayProcessing && activeTrayAction === 'archive'
    ? 'Working…'
    : 'Archive this call';
  const deleteActionLabel =
    trayProcessing && activeTrayAction === 'delete' ? 'Working…' : 'Delete this call';

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
        title="Recent Calls"
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
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={refreshAccent}
            colors={[refreshAccent]}
            progressBackgroundColor={refreshAccent}
            style={{ backgroundColor: refreshAccentPortion }}
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
      <Modal
        visible={isTrayMounted && Boolean(trayCall)}
        transparent
        animationType="none"
        onRequestClose={hideTray}
      >
        <View style={styles.trayOverlay} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.trayBackdrop,
              { opacity: trayBackdropOpacity, position: 'absolute', width: '100%', height: '100%' },
            ]}
          />
          <Pressable style={StyleSheet.absoluteFill} onPress={hideTray} />
          {trayCall && (
            <Animated.View
              style={[
                styles.tray,
                {
                  transform: [{ translateY: trayTranslateY }],
                },
              ]}
            >
              <View style={styles.trayHandle} />
              <Text style={styles.trayTitle}>Call options</Text>
              <Text style={styles.traySubtitle}>
                {formatPhoneNumber(trayCall.caller_number, 'Recent call')}
              </Text>
              <Text style={styles.trayDetail}>
                {formatTime(trayCall.created_at)}
                {formatDateLabel(trayCall.created_at) ? ` · ${formatDateLabel(trayCall.created_at)}` : ''}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.trayAction,
                  pressed && styles.trayActionPressed,
                  trayProcessing && styles.trayActionDisabled,
                ]}
                onPress={toggleArchiveCall}
                disabled={trayProcessing}
              >
                <Text style={styles.trayActionText}>{primaryActionLabel}</Text>
                <Text style={styles.trayActionHint}>
                  {isTrayArchived
                    ? 'Restores it to the main feed.'
                    : 'Moves it to archived section.'}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.trayAction,
                  styles.trayDanger,
                  pressed && styles.trayActionPressed,
                  trayProcessing && styles.trayActionDisabled,
                ]}
                onPress={deleteCall}
                disabled={trayProcessing}
              >
                <Text style={[styles.trayActionText, styles.trayDangerText]}>{deleteActionLabel}</Text>
                <Text style={styles.trayActionHint}>Removes the call permanently.</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.trayAction,
                  styles.trayCancel,
                  pressed && styles.trayActionPressed,
                ]}
                onPress={hideTray}
                disabled={trayProcessing}
              >
                <Text style={styles.trayCancelText}>Cancel</Text>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </Modal>
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
  callItemHandled: {
    backgroundColor: '#1f2637',
    borderColor: '#2c3448',
  },
  callItemArchived: {
    backgroundColor: '#181d29',
    borderColor: '#1f2335',
  },
  callItemPressed: {
    transform: [{ scale: 0.98 }],
  },
  callItemMuted: {
    opacity: 0.7,
    backgroundColor: '#111b27',
    borderColor: 'rgba(255,255,255,0.15)',
    shadowOpacity: 0.1,
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
  callIconStackHandled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  callIconStackArchived: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  callIconStackMuted: {
    opacity: 0.55,
  },
  callIconMuted: {
    opacity: 0.6,
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
  callTitleMuted: {
    color: '#b0b5c8',
  },
  callTimestamp: {
    color: '#8aa0c6',
    marginTop: 4,
    fontSize: 14,
  },
  callTimestampMuted: {
    color: '#6f7a94',
  },
  statusPill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  statusPillHandled: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statusPillArchived: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statusPillMuted: {
    opacity: 0.45,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusTextMuted: {
    opacity: 0.6,
  },
  emptyStateWrap: {
    marginTop: 100,
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
  trayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 999,
    elevation: 999,
  },
  trayBackdrop: {
    backgroundColor: '#02050b',
  },
  tray: {
    position: 'absolute',
    left: -12,
    right: -12,
    bottom: 0,
    borderRadius: 30,
    backgroundColor: '#0c1118',
    paddingVertical: 24,
    paddingHorizontal: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    zIndex: 1000,
    elevation: 30,
  },
  trayHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  trayTitle: {
    color: '#f5f7fb',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'left',
    marginBottom: 6,
  },
  traySubtitle: {
    color: '#8aa0c6',
    fontSize: 14,
    textAlign: 'left',
    marginBottom: 2,
  },
  trayDetail: {
    color: '#6f7a94',
    fontSize: 12,
    textAlign: 'left',
    marginBottom: 18,
  },
  trayAction: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 12,
  },
  trayActionPressed: {
    opacity: 0.8,
  },
  trayActionDisabled: {
    opacity: 0.6,
  },
  trayActionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  trayActionHint: {
    color: '#8aa0c6',
    fontSize: 12,
    marginTop: 4,
  },
  trayDanger: {
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  trayDangerText: {
    color: '#f87171',
  },
  trayCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  trayCancelText: {
    color: '#f5f7fb',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
