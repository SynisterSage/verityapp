import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import { createSupportTicket, deleteSupportTicket, fetchSupportTickets, SupportTicketSummary } from '../../services/support';
import { navigateToSupportModal } from '../../navigation/rootNavigator';
import { navigateToSupportResource } from '../../navigation/rootNavigator';
import ActionFooter from '../../components/onboarding/ActionFooter';
import DashboardHeader from '../../components/common/DashboardHeader';
import type { RootStackParamList } from '../../navigation/types';
import type { AppTheme } from '../../theme/tokens';


import { SUPPORT_PORTAL_RESOURCES } from '../../data/supportResources';
import * as Haptics from 'expo-haptics';

function getRelativeLabel(value?: string | null) {
  if (!value) return 'Unknown';
  const now = Date.now();
  const date = new Date(value).getTime();
  const diffMs = now - date;
  if (diffMs < 0) {
    return 'now';
  }
  const minutes = diffMs / (1000 * 60);
  if (minutes < 60) {
    const rounded = Math.max(1, Math.round(minutes));
    return `${rounded}m`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    const rounded = Math.max(1, Math.round(hours));
    return `${rounded}h`;
  }
  const days = hours / 24;
  if (days < 7) {
    const rounded = Math.max(1, Math.round(days));
    return `${rounded}d`;
  }
  const weeks = Math.max(1, Math.round(days / 7));
  return `${weeks}w`;
}

function getTicketState(ticket: SupportTicketSummary) {
  const metadata = ticket.last_message?.metadata as Record<string, unknown> | null;
  const ticketState = typeof metadata?.ticketState === 'string' ? metadata.ticketState : null;
  return ticketState === 'closed' ? 'handled' : 'active';
}


export default function SupportTicketsScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, 'SupportPortal'>>();
  const { mode, theme } = useTheme();
  const { profiles, setActiveProfile } = useProfile();
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [trayTicket, setTrayTicket] = useState<SupportTicketSummary | null>(null);
  const [isTrayMounted, setIsTrayMounted] = useState(false);
  const trayAnim = useRef(new Animated.Value(0)).current;
  const [trayState, setTrayState] = useState<'active' | 'handled' | null>(null);
  const [trayProcessing, setTrayProcessing] = useState(false);
  const [activeTrayAction, setActiveTrayAction] = useState<'end' | 'delete' | null>(null);

  const primaryName = profiles[0]?.first_name;
  const greeting = primaryName ? `How can we assist you, ${primaryName}?` : 'How can we assist you today?';
  const styles = useMemo(() => createStyles(theme), [theme]);

  const loadTickets = useCallback(
    async (opts?: { showLoading?: boolean }) => {
      const showLoading = opts?.showLoading ?? true;
      if (showLoading) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await fetchSupportTickets();
        setTickets(data);
      } catch (err) {
        console.warn('Failed to load support tickets', err);
        setError('Unable to load support history.');
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    []
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadTickets({ showLoading: false }).finally(() => setRefreshing(false));
  }, [loadTickets]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const handleOpenChat = useCallback(
    (ticketProfileId: string, ticketId: string) => {
      const profile = profiles.find((item) => item.id === ticketProfileId);
      if (profile) {
        setActiveProfile(profile);
      }
      navigateToSupportModal({ ticketId, profileId: ticketProfileId });
    },
    [profiles, setActiveProfile]
  );

  const handleDeleteTicket = useCallback(
    async (ticket: SupportTicketSummary, options?: { silent?: boolean }) => {
      try {
        await deleteSupportTicket(ticket.profile_id, ticket.ticket_id);
        if (!options?.silent) {
          Alert.alert('Conversation removed', 'This handled ticket has been deleted from your history.');
        }
        await loadTickets({ showLoading: false });
      } catch (err) {
        console.warn('Failed to delete support ticket', err);
        Alert.alert('Unable to delete', 'Please try again later.');
        throw err;
      }
    },
    [loadTickets]
  );

  const showTray = useCallback(
    (ticket: SupportTicketSummary, state: 'active' | 'handled') => {
      setTrayTicket(ticket);
      setTrayState(state);
      setIsTrayMounted(true);
      trayAnim.setValue(0);
      Animated.timing(trayAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [trayAnim]
  );

  const hideTray = useCallback(() => {
    Animated.timing(trayAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsTrayMounted(false);
      setTrayTicket(null);
      setTrayState(null);
      setActiveTrayAction(null);
      setTrayProcessing(false);
    });
  }, [trayAnim]);

  const trayBackdropOpacity = trayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.45],
  });
  const trayTranslateY = trayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  const handleTrayLongPress = useCallback(
    (ticket: SupportTicketSummary) => {
      const state = getTicketState(ticket);
      showTray(ticket, state);
    },
    [showTray]
  );

  const handleTrayEndTicket = useCallback(() => {
    if (!trayTicket) {
      return;
    }
    hideTray();
    navigateToSupportModal({
      ticketId: trayTicket.ticket_id,
      profileId: trayTicket.profile_id,
      autoEnd: true,
    });
  }, [hideTray, trayTicket]);

  const handleTrayDelete = useCallback(async () => {
    if (!trayTicket) {
      return;
    }
    setTrayProcessing(true);
    setActiveTrayAction('delete');
    try {
      await handleDeleteTicket(trayTicket, { silent: true });
      hideTray();
    } catch (err) {
      // Error already handled inside handleDeleteTicket
    } finally {
      setTrayProcessing(false);
      setActiveTrayAction(null);
    }
  }, [handleDeleteTicket, hideTray, trayTicket]);

  const handleStartNew = useCallback(async () => {
    if (profiles.length === 0) {
      setError('Finish setting up a profile before contacting support.');
      return;
    }
    const primaryProfile = profiles[0];
      setActiveProfile(primaryProfile);
      setCreatingTicket(true);
    try {
      const data = await createSupportTicket(primaryProfile.id);
      setCreatingTicket(false);
      setError(null);
      navigateToSupportModal({ profileId: primaryProfile.id, ticketId: data?.ticketId ?? null });
    } catch (err) {
      console.warn('Failed to start new ticket', err);
      setCreatingTicket(false);
      setError('Unable to start a new support conversation. Please try again.');
    }
  }, [profiles, setActiveProfile]);

  const sections = useMemo(() => {
    const activeTickets = tickets.filter((ticket) => getTicketState(ticket) === 'active');
    const handledTickets = tickets.filter((ticket) => getTicketState(ticket) === 'handled');
    const sectionsList = [] as { title: string; data: SupportTicketSummary[] }[];
    if (activeTickets.length > 0) {
      sectionsList.push({ title: 'Active conversations', data: activeTickets });
    }
    if (handledTickets.length > 0) {
      sectionsList.push({ title: 'Handled conversations', data: handledTickets });
    }
    return sectionsList;
  }, [tickets]);

  const renderTicketItem = useCallback(
    ({ item }: { item: SupportTicketSummary }) => {
      const state = getTicketState(item);
      const snippet =
        state === 'handled'
          ? 'Ticket resolved'
          : item.last_message?.content?.trim().slice(0, 80) ?? 'No conversations yet';
      const avatarColor = state === 'active' ? theme.colors.accent : withOpacity(theme.colors.text, 0.15);
      const avatarIconColor = state === 'active' ? '#fff' : theme.colors.textDim;
      return (
        <Pressable
          onPress={() => handleOpenChat(item.profile_id, item.ticket_id)}
          onLongPress={() => handleTrayLongPress(item)}
          delayLongPress={300}
          style={styles.ticketRow}
        >
            <View style={styles.ticketRowIconRow}>
              <View style={styles.avatarWrapper}>
                <View style={[styles.avatar, { backgroundColor: avatarColor }]}> 
                  <Ionicons name="chatbubble-outline" size={22} color={avatarIconColor} />
                </View>
                {item.unread_agent_messages > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{item.unread_agent_messages}</Text>
                  </View>
                )}
              </View>
            <View style={styles.ticketTextBlock}>
              <Text style={[styles.ticketTitle, { color: theme.colors.text, fontSize: 19 }]} numberOfLines={1}>
                {item.profile_name}
              </Text>
              <Text style={[styles.ticketSnippet, { color: theme.colors.textMuted }]} numberOfLines={2}>
                {snippet}
              </Text>
            </View>
            <Text style={[styles.ticketTime, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {getRelativeLabel(item.last_activity_at)}
            </Text>
          </View>
        </Pressable>
      );
    },
    [handleOpenChat, theme]
  );

  const ListEmpty = useCallback(() => {
    if (loading) {
      return null;
    }
    return (
      <View style={styles.emptyState}>
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}> 
          {error ? 'Something went wrong' : 'No tickets yet'}
        </Text>
        <Text style={[styles.emptyBody, { color: theme.colors.textMuted }]}> 
          {error ?? 'Start a chat and every message will save to this timeline. Our assistant asks what you need before you reply.'}
        </Text>
        <Pressable
          onPress={handleStartNew}
          disabled={creatingTicket}
          style={({ pressed }) => [
            styles.startButton,
            {
              backgroundColor: creatingTicket ? withOpacity(theme.colors.accent, 0.6) : theme.colors.accent,
              opacity: creatingTicket ? 0.8 : 1,
            },
          ]}
        >
          {creatingTicket ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.startButtonText}>Send a support message</Text>
          )}
        </Pressable>
    </View>
  );
}, [creatingTicket, error, handleStartNew, loading, theme.colors]);

  const ListHeader = useCallback(() => {
    return (
        <View style={styles.resourcesSection}>
          <Text
            style={[
              styles.sectionHeader,
              { color: theme.colors.textMuted, fontWeight: '600' },
            ]}
          >
            RESOURCES
          </Text>
          <View style={styles.resourcesGrid}>
            {SUPPORT_PORTAL_RESOURCES.map((resource) => (
              <Pressable
                key={resource.id}
                style={({ pressed }) => [
                  styles.resourceTile,
                  {
                    backgroundColor: pressed
                      ? withOpacity(theme.colors.surfaceAlt, 0.9)
                      : theme.colors.surfaceAlt,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => null);
                  navigateToSupportResource({ resource: resource.resource, title: resource.title });
                }}
              >
                <Ionicons name={resource.icon as any} size={18} color={theme.colors.accent} style={styles.resourceIcon} />
                <Text style={[styles.resourceLabel, { color: theme.colors.text }]}>{resource.label}</Text>
              </Pressable>
            ))}
        </View>
      </View>
    );
  }, [theme.colors]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]}> 
      <View style={styles.headerContainer}>
        <DashboardHeader
          title={greeting}
          subtitle="Leave a message for our safety team or browse the quick guides below."
          align="left"
        />
      </View>
      <View style={styles.contentArea}>
        {loading && tickets.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.ticket_id}
          renderItem={renderTicketItem}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionHeader, { color: theme.colors.textMuted }]}> 
              {section.title}
            </Text>
          )}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.accent} />
          }
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
        )}
      </View>
      <Modal
        visible={isTrayMounted && Boolean(trayTicket)}
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
          {trayTicket && (
            <Animated.View
              style={[
                styles.tray,
                {
                  transform: [{ translateY: trayTranslateY }],
                },
              ]}
            >
              <View style={styles.trayContent}>
                <View style={styles.trayHandle} />
                <Text style={styles.trayTitle}>{trayState === 'handled' ? 'Handled conversation' : 'Active conversation'}</Text>
                <Text style={styles.traySubtitle}>{trayTicket.profile_name}</Text>
                <Text style={styles.trayDetail}>{getRelativeLabel(trayTicket.last_activity_at)}</Text>
                {trayState === 'handled' ? (
                  <Pressable
                    style={({ pressed }) => [styles.trayAction, pressed && styles.trayActionPressed]}
                    onPress={handleTrayDelete}
                    disabled={trayProcessing}
                  >
                    <Text style={styles.trayActionText}>
                      {trayProcessing && activeTrayAction === 'delete' ? 'Deleting…' : 'Delete from history'}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.trayAction, pressed && styles.trayActionPressed]}
                    onPress={handleTrayEndTicket}
                    disabled={trayProcessing}
                  >
                    <Text style={styles.trayActionText}>End ticket</Text>
                  </Pressable>
                )}
                <Pressable style={styles.trayCancel} onPress={hideTray}>
                  <Text style={styles.trayCancelText}>Cancel</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </View>
      </Modal>
      <ActionFooter
        primaryLabel="New Message"
        onPrimaryPress={handleStartNew}
        primaryLoading={creatingTicket}
        primaryBackgroundColor={theme.colors.accent}
        primaryTextColor={mode === 'light' ? theme.colors.surface : theme.colors.text}
        style={styles.actionFooter}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    headerContainer: {
      paddingTop: 12,
      paddingHorizontal: 24,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contentArea: {
      flex: 1,
      paddingTop: 16,
      paddingHorizontal: 24,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 80,
    },
    listContent: {
      paddingBottom: 220,
    },
    ticketRow: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.04)',
      paddingVertical: 16,
    },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginTop: 16,
      marginBottom: 6,
      paddingHorizontal: 0,
    },
    ticketRowIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 0,
    },
    avatarWrapper: {
      position: 'relative',
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    unreadBadge: {
      position: 'absolute',
      top: 38,
      right: 12,
      minWidth: 24,
      paddingHorizontal: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
    },
    unreadBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    ticketTextBlock: {
      flex: 1,
      marginRight: 12,
    },
    ticketTitle: {
      fontSize: 19,
      fontWeight: '600',
    },
    ticketSnippet: {
      fontSize: 16,
      lineHeight: 24,
    },
    ticketMeta: {
      fontSize: 12,
      letterSpacing: 0.15,
      marginTop: 4,
    },
    ticketSubject: {
      fontSize: 14,
      marginTop: 6,
    },
    ticketTime: {
      fontSize: 12,
      fontWeight: '600',
    },
    resourcesSection: {
      marginTop: 6,
      marginBottom: 8,
    },
    resourcesLabel: {
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.25,
      marginBottom: 8,
    },
    resourcesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginTop: 12,
    },
    resourceTile: {
      width: '48%',
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 24,
      marginBottom: 12,
    },
    resourceIcon: {
      marginRight: 10,
    },
    resourceLabel: {
      fontSize: 14,
      fontWeight: '600',
    },
    emptyState: {
      marginTop: 40,
      alignItems: 'center',
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 8,
    },
    emptyBody: {
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 16,
      lineHeight: 20,
      paddingBottom: -20,
    },
    startButton: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 999,
    },
    startButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
    },
    headerTitle: {
      fontSize: 32,
      fontWeight: '700',
      lineHeight: 38,
    },
    headerSubtitle: {
      fontSize: 17,
      fontWeight: '500',
      marginTop: 8,
      lineHeight: 24,
    },
    actionFooter: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
    },
    trayOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    trayBackdrop: {
      backgroundColor: theme.colors.overlay,
    },
    tray: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 24,
      width: '100%',
      position: 'absolute',
      bottom: 0,
    },
    trayContent: {
      alignItems: 'center',
    },
    trayHandle: {
      width: 64,
      height: 4,
      borderRadius: 2,
      backgroundColor: withOpacity(theme.colors.text, 0.25),
      marginBottom: 12,
    },
    trayTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 4,
    },
    traySubtitle: {
      fontSize: 16,
      color: theme.colors.textMuted,
      marginBottom: 4,
    },
    trayDetail: {
      fontSize: 14,
      color: theme.colors.textMuted,
      marginBottom: 24,
    },
    trayAction: {
      width: '100%',
      paddingVertical: 16,
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      marginBottom: 12,
    },
    trayActionPressed: {
      opacity: 0.8,
    },
    trayActionText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.accent,
    },
    trayCancel: {
      marginTop: 12,
    },
    trayCancelText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.textMuted,
    },
  });
