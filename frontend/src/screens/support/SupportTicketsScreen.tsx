import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
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
import { createSupportTicket, fetchSupportTickets, SupportTicketSummary } from '../../services/support';
import { navigateToSupportModal } from '../../navigation/rootNavigator';
import type { RootStackParamList } from '../../navigation/types';

function formatTimestamp(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function SupportTicketsScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, 'SupportPortal'>>();
  const { theme } = useTheme();
  const { profiles, setActiveProfile } = useProfile();
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingTicket, setCreatingTicket] = useState(false);

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

  const ticketsWithPlaceholders = useMemo(() => {
    if (tickets.length > 0) {
      return tickets;
    }
    return [];
  }, [tickets]);

  const renderTicketItem = useCallback(
    ({ item }: { item: SupportTicketSummary }) => {
      const hasUnread = item.unread_agent_messages > 0;
      const snippet = item.last_message?.content?.trim().slice(0, 80) ?? 'No conversations yet';
      const subject = item.ticket_subject ?? 'New conversation';
      return (
        <Pressable
          onPress={() => handleOpenChat(item.profile_id, item.ticket_id)}
          style={({ pressed }) => [
            styles.ticketRow,
            { backgroundColor: pressed ? withOpacity(theme.colors.surface, 0.95) : theme.colors.surface },
          ]}
        >
            <View style={styles.ticketRowLeft}>
              <Text style={[styles.ticketTitle, { color: theme.colors.text }]}>{item.profile_name}</Text>
              {subject ? (
                <Text style={[styles.ticketSubject, { color: theme.colors.textDim }]}>{subject}</Text>
              ) : null}
              <Text style={[styles.ticketSnippet, { color: theme.colors.textMuted }]} numberOfLines={2}>
                {snippet}
              </Text>
            </View>
          <View style={styles.ticketMeta}>
            <Text style={[styles.ticketTime, { color: theme.colors.textMuted }]}>
              {formatTimestamp(item.last_activity_at)}
            </Text>
            {hasUnread ? (
              <View style={[styles.unreadBadge, { backgroundColor: theme.colors.accent }]}>
                <Text style={styles.unreadBadgeText}>{item.unread_agent_messages}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [handleOpenChat, theme.colors.text, theme.colors.surface, theme.colors.textMuted, theme.colors.accent]
  );

  const ListHeader = useCallback(() => {
    return (
      <View style={styles.headerCopy}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>History Feed</Text>
        <Text style={[styles.headerSubtitle, { color: theme.colors.textMuted }]}>
          View every ticket tied to your circle, respond, or whip up a fresh message.
        </Text>
      </View>
    );
  }, [theme.colors.text, theme.colors.textMuted]);

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
          {error ?? 'Start a chat and every message will save to this timeline. The assistant will ask what you need before you reply so we can capture the subject.'}
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
  }, [error, handleStartNew, loading, theme.colors.accent, theme.colors.text, theme.colors.textMuted, creatingTicket]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <View
        style={[
          styles.topBar,
          {
            borderColor: withOpacity(theme.colors.text, 0.12),
            backgroundColor: theme.colors.bg,
          },
        ]}
      >
        <View>
          <Text style={[styles.topTitle, { color: theme.colors.text }]}>Support</Text>
          <Text style={[styles.topSubtitle, { color: theme.colors.textMuted }]}>
            Stay on top of every ticket and new reply.
          </Text>
        </View>
        <Pressable onPress={navigation.goBack} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={theme.colors.text} />
        </Pressable>
      </View>
      <View
        style={[
          styles.bodyWrapper,
          { backgroundColor: withOpacity(theme.colors.surface, 0.08) },
        ]}
      >
        {loading && tickets.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : (
          <FlatList
            data={ticketsWithPlaceholders}
            keyExtractor={(item) => item.ticket_id}
            renderItem={renderTicketItem}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={ListEmpty}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.accent} />
            }
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
      <View style={styles.newTicketFooter}>
        <Pressable onPress={handleStartNew} style={[styles.footerButton, { backgroundColor: theme.colors.accent }]}>
          <Text style={styles.footerButtonText}>New support message</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  topSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyWrapper: {
    flex: 1,
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 32,
    paddingTop: 20,
    paddingBottom: 10,
    paddingHorizontal: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  listContent: {
    paddingBottom: 200,
    paddingHorizontal: 16,
  },
  ticketRow: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  ticketRowLeft: {
    marginBottom: 8,
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  ticketSnippet: {
    fontSize: 14,
    marginTop: 4,
  },
  ticketSubject: {
    fontSize: 12,
    marginTop: 2,
  },
  ticketMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketTime: {
    fontSize: 12,
  },
  unreadBadge: {
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    alignItems: 'center',
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
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
  newTicketFooter: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  footerButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  footerButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  headerCopy: {
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
});
