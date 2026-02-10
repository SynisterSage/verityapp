import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { useProfile } from '../../context/ProfileContext';
import { useSupportContext } from '../../context/SupportContext';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import {
  createSupportMessage,
  fetchSupportMessages,
  markSupportMessagesRead,
  SupportMessage,
} from '../../services/support';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import type { AppTheme, ThemeMode } from '../../theme/tokens';

const QUICK_PROMPTS = [
  {
    label: 'Report scam',
    message: 'I need help reporting a suspicious call. The number was ___ and it mentioned ___.',
  },
  {
    label: 'Billing question',
    message:
      'I noticed a charge from the App Store/Play Store for Verity Protect. Can you help me understand or gather info for a refund?',
  },
  {
    label: 'Technical help',
    message: 'I need assistance resetting my safety PIN and syncing a new device.',
  },
  {
    label: 'Call schedule',
    message: 'I would like to see a list of upcoming Verity calls for my loved one.',
  },
  {
    label: 'Caregiver change',
    message: 'How do I add or replace a caregiver on this account?',
  },
  {
    label: 'Status check',
    message: 'Can you check whether the agent I spoke with earlier has any notes?'
  },
  {
    label: 'Safety advice',
    message: 'Do you have any tips to avoid giving personal info to strangers?',
  },
];

function formatTimestamp(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function SupportScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, 'SupportModal'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'SupportModal'>>();
  const { activeProfile } = useProfile();
  const { mode, theme } = useTheme();
  const { refreshUnread, assistantOnline, playNotificationSound } = useSupportContext();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerText, setComposerText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<FlatList<SupportMessage> | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<'positive' | 'neutral' | 'negative' | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [ticketClosed, setTicketClosed] = useState(false);
  const [currentTicketId, setCurrentTicketId] = useState<string | null>(route.params?.ticketId ?? null);
  const [autoEndTriggered, setAutoEndTriggered] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const lastAgentIdRef = useRef<string | null>(null);
  const isNewTicket = route.params?.newTicket ?? false;
  const activeTicketId = route.params?.ticketId ?? currentTicketId;

  const getTicketIdFromMetadata = useCallback((metadata?: Record<string, unknown> | null) => {
    const ticketId = metadata?.ticketId;
    if (typeof ticketId === 'string' && ticketId.trim().length > 0) {
      return ticketId;
    }
    return null;
  }, []);

  const triggerSuccessAnimation = useCallback(() => {
    successScale.setValue(0);
    successOpacity.setValue(0);
    setShowSuccessAnimation(true);
    Animated.parallel([
      Animated.spring(successScale, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(successOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setShowSuccessAnimation(false));
      }, 1100);
    });
  }, [successOpacity, successScale]);

  const loadMessages = useCallback(
    async (opts?: { showLoading?: boolean; ticketId?: string | null }) => {
      if (!activeProfile?.id) {
        setMessages([]);
        setLoading(false);
        return;
      }
    const showLoading = opts?.showLoading ?? true;
    const ticketIdToUse = opts?.ticketId ?? currentTicketId;
    if (!ticketIdToUse) {
      setMessages([]);
      if (showLoading) {
        setLoading(false);
      }
      return;
    }
      if (showLoading) {
        setLoading(true);
      }
      try {
      const data = await fetchSupportMessages(activeProfile.id, ticketIdToUse);
      setMessages(data);
        if (!opts?.ticketId && data.length > 0) {
          const inferredFromMetadata = data
            .map((message) => getTicketIdFromMetadata(message.metadata))
            .filter(Boolean)[0];
          if (inferredFromMetadata) {
            setCurrentTicketId((prev) => prev ?? inferredFromMetadata);
          }
        }
      await markSupportMessagesRead(activeProfile.id);
        await refreshUnread();
      } catch (err) {
      console.warn('Failed to load support conversation', err);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [activeProfile?.id, currentTicketId, getTicketIdFromMetadata, refreshUnread, setCurrentTicketId]);

  const handleRefresh = useCallback(() => {
    if (!activeProfile?.id) {
      return;
    }
    setRefreshing(true);
    void loadMessages({ showLoading: false, ticketId: activeTicketId }).finally(() =>
      setRefreshing(false)
    );
  }, [activeProfile?.id, activeTicketId, loadMessages]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }
    const latestAgent = [...messages]
      .filter((message) => message.sender === 'agent')
      .slice(-1)[0];
    if (!latestAgent) {
      return;
    }
    if (latestAgent.id !== lastAgentIdRef.current && !latestAgent.is_read_by_user) {
      lastAgentIdRef.current = latestAgent.id;
      void playNotificationSound();
    }
  }, [messages, playNotificationSound]);

  useEffect(() => {
    const latestMessage = [...messages].slice(-1)[0];
    const ticketState = (latestMessage?.metadata as Record<string, unknown> | null)?.ticketState;
    setTicketClosed(ticketState === 'closed');
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  useEffect(() => {
    if (!activeProfile?.id) {
      return;
    }
    if (isNewTicket && !currentTicketId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    void loadMessages({ ticketId: activeTicketId });
  }, [activeProfile?.id, activeTicketId, isNewTicket, loadMessages]);

  useEffect(() => {
    const nextTicketId = route.params?.ticketId ?? null;
    if (nextTicketId && nextTicketId !== currentTicketId) {
      setCurrentTicketId(nextTicketId);
    }
  }, [currentTicketId, route.params?.ticketId]);


  const handleSend = useCallback(async () => {
    if (!activeProfile?.id) {
      return;
    }
    const trimmed = composerText.trim();
    if (!trimmed) {
      return;
    }
    setIsSending(true);
    try {
    const metadata: Record<string, unknown> = {};
    if (currentTicketId) {
      metadata.ticketId = currentTicketId;
    }
    if (selectedPrompt) {
      metadata.promptLabel = selectedPrompt;
    }
    const payload = Object.keys(metadata).length > 0 ? { metadata } : undefined;
    const message = await createSupportMessage(activeProfile.id, { content: trimmed, metadata });
      setComposerText('');
      setSelectedPrompt(null);
      const messageMetadata = message?.metadata as Record<string, unknown> | null;
      const nextTicketId = getTicketIdFromMetadata(messageMetadata) ?? currentTicketId;
      if (nextTicketId && nextTicketId !== currentTicketId) {
        setCurrentTicketId(nextTicketId);
      }
      await loadMessages({ ticketId: nextTicketId });
      Keyboard.dismiss();
    } catch (err) {
      console.warn('Failed to send support message', err);
    } finally {
      setIsSending(false);
    }
  }, [activeProfile?.id, composerText, currentTicketId, getTicketIdFromMetadata, loadMessages]);

  const handlePromptPress = useCallback((prompt: { label: string; message: string }) => {
    setComposerText(prompt.message);
    setSelectedPrompt(prompt.label);
  }, []);

  const submitFeedback = useCallback(async () => {
    if (!activeProfile?.id || ticketClosed || !feedbackRating || !currentTicketId) {
      return;
    }
    const trimmedNote = feedbackNote.trim();
    setIsSending(true);
    try {
      const metadata = {
        ticketId: currentTicketId,
        ticketState: 'closed',
        feedbackRating,
        feedbackNote: trimmedNote || undefined,
      };
      await createSupportMessage(activeProfile.id, {
        content: trimmedNote ? `Feedback: ${trimmedNote}` : `Feedback: ${feedbackRating}`,
        metadata,
      });
      setTicketClosed(true);
      setShowFeedback(false);
      setFeedbackNote('');
      setFeedbackRating(null);
      await loadMessages({ ticketId: currentTicketId });
      triggerSuccessAnimation();
    } catch (err) {
      console.warn('Failed to submit feedback', err);
    } finally {
      setIsSending(false);
    }
  }, [
    activeProfile?.id,
    currentTicketId,
    feedbackNote,
    feedbackRating,
    loadMessages,
    ticketClosed,
    triggerSuccessAnimation,
  ]);

  const handleEndTicketPress = useCallback(() => {
    if (!currentTicketId || ticketClosed) {
      return;
    }
    Alert.alert(
      'End ticket',
      'Closing this ticket will archive the conversation. You can reopen a new one anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End ticket',
          style: 'destructive',
          onPress: () => setShowFeedback(true),
        },
      ]
    );
  }, [currentTicketId, ticketClosed]);

  useEffect(() => {
    if (!route.params?.autoEnd) {
      setAutoEndTriggered(false);
      return;
    }
    if (autoEndTriggered) {
      return;
    }
    if (messages.length === 0 || !currentTicketId) {
      return;
    }
    setAutoEndTriggered(true);
    handleEndTicketPress();
  }, [route.params?.autoEnd, autoEndTriggered, messages.length, currentTicketId, handleEndTicketPress]);

  const handleCloseFeedback = useCallback(() => {
    setShowFeedback(false);
    Keyboard.dismiss();
  }, []);

  const statusMessage = useMemo(() => {
    if (!activeProfile) {
      return 'Support chat is available once your profile is ready. Finish onboarding to start a saved conversation.';
    }
    if (loading) {
      return 'Loading your chat history…';
    }
    if (messages.length === 0) {
      return 'Send us a note and we will reply shortly.';
    }
    return null;
  }, [activeProfile, loading, messages.length]);

  const headerSubtitle = statusMessage || 'Every message is stored in a ticket so you can revisit the timeline later.';

  const composerBackgroundColor = theme.colors.surface;
  const composerInputBackground = theme.colors.surface;
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);

  const composerDisabled = isSending || !composerText.trim() || !activeProfile || ticketClosed;
  const headerTitle = useMemo(() => {
    const ticketCandidate = [...messages]
      .slice()
      .reverse()
      .map((message) => getTicketIdFromMetadata(message.metadata))
      .find(Boolean);
    const ticketId = currentTicketId ?? ticketCandidate;
    if (!ticketId) {
      return 'Help Session';
    }
    const sanitized = ticketId.trim();
    const display =
      sanitized.length > 6 ? `…${sanitized.slice(-6)}` : sanitized;
    return `Ticket ${display}`;
  }, [currentTicketId, getTicketIdFromMetadata, messages]);

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.container, { backgroundColor: theme.colors.bg }]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 80}
      >
        <View style={styles.flex}>
          <View
            style={[
              styles.headerGlass,
              {
                borderColor: withOpacity(theme.colors.border, 0.6),
                backgroundColor: theme.colors.bg,
              },
            ]}
          >
            <Pressable
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
                {headerTitle}
              </Text>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: assistantOnline ? theme.colors.success : withOpacity(theme.colors.text, 0.2) },
                  ]}
                />
                <Text
                  style={[
                    styles.statusLabel,
                    { color: withOpacity(theme.colors.text, assistantOnline ? 0.6 : 0.4) },
                  ]}
                >
                  {assistantOnline ? 'ASSISTANT ONLINE' : 'ASSISTANT OFFLINE'}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={handleEndTicketPress}
              disabled={!currentTicketId || ticketClosed}
              style={({ pressed }) => [
                styles.endSessionHeader,
                {
                  opacity: !currentTicketId || ticketClosed ? 0.4 : 1,
                  backgroundColor: pressed
                    ? withOpacity(theme.colors.danger, 0.18)
                    : withOpacity(theme.colors.danger, 0.08),
                },
              ]}
              accessibilityLabel="End session"
            >
              <Ionicons name="close-circle" size={20} color={theme.colors.danger} />
            </Pressable>
          </View>

          <View style={styles.messagesWrapper}>
            {showSuccessAnimation && (
              <Animated.View
                style={[
                  styles.successAnimationOverlay,
                  {
                    opacity: successOpacity,
                    transform: [{ scale: successScale }],
                  },
                ]}
              >
                <Ionicons name="checkmark-circle-outline" size={36} color={theme.colors.success} />
                <Text style={[styles.successAnimationText, { color: theme.colors.success }]}>Ticket closed</Text>
              </Animated.View>
            )}
            {loading ? (
              <ActivityIndicator color={theme.colors.accent} size="small" />
            ) : statusMessage && messages.length === 0 ? (
              <View style={styles.statusMessage}>
                <Text style={[styles.statusMessageText, { color: theme.colors.textMuted }]}>
                  {statusMessage}
                </Text>
              </View>
            ) : (
              <FlatList
                ref={scrollRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isUser = item.sender === 'user';
              const statusIcon = isUser
                ? item.is_read_by_agent
                  ? 'eye'
                  : 'shield-checkmark'
                : undefined;
              return (
                    <View style={styles.messageRow}>
                      <View
                        style={[
                          styles.messageBubble,
                          isUser ? styles.userBubble : styles.agentBubble,
                          {
                            backgroundColor: isUser ? theme.colors.accent : theme.colors.surfaceAlt,
                            borderBottomRightRadius: isUser ? 6 : 24,
                            borderBottomLeftRadius: isUser ? 24 : 6,
                            borderColor: isUser ? 'transparent' : withOpacity(theme.colors.text, 0.2),
                            borderWidth: isUser ? 0 : StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <Text style={[styles.messageText, { color: isUser ? '#fff' : theme.colors.text }]}>
                          {item.content}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.metadataRow,
                          isUser ? styles.metadataRowRight : null,
                        ]}
                      >
                        <Text style={[styles.metadataText, { color: withOpacity(theme.colors.text, 0.4) }]}>
                          {formatTimestamp(item.created_at)}
                        </Text>
                        <Ionicons
                          name={statusIcon}
                          size={14}
                          color={withOpacity(theme.colors.text, 0.4)}
                          style={styles.metadataIcon}
                          accessible={false}
                        />
                      </View>
                    </View>
                    );
                  }}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor={theme.colors.accent}
                    titleColor={theme.colors.textMuted}
                    colors={[theme.colors.accent]}
                    progressBackgroundColor={
                      mode === 'dark'
                        ? withOpacity(theme.colors.surface, 0.08)
                        : theme.colors.surface
                    }
                  />
                }
              />
            )}
          </View>

          {!ticketClosed && (
          <View style={styles.quickActions}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickActionsContent}
            >
              {QUICK_PROMPTS.map((prompt) => {
                const active = prompt.label === selectedPrompt;
                return (
                  <Pressable
                    key={prompt.label}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => null);
                      handlePromptPress(prompt);
                    }}
                    style={({ pressed }) => [
                      styles.quickChip,
                      {
                        backgroundColor: active
                          ? theme.colors.accent
                          : pressed
                          ? withOpacity(theme.colors.accent, 0.12)
                          : theme.colors.surfaceAlt,
                      },
                    ]}
                  >
                    <Text style={[styles.quickChipText, { color: active ? '#fff' : theme.colors.text }]}>
                      {prompt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          )}

          {!ticketClosed && (
          <View
            style={[
              styles.composerOuter,
              {
                backgroundColor: composerBackgroundColor,
                borderColor: withOpacity(theme.colors.text, 0.08),
              },
            ]}
          >
            {ticketClosed ? (
              <Text style={[styles.ticketClosedCopy, { color: theme.colors.textMuted }]}>
                Ticket closed. Start a new one from the portal to continue the conversation.
              </Text>
            ) : (
              <>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: theme.colors.text,
                      backgroundColor: composerInputBackground,
                      borderColor: 'transparent',
                    },
                  ]}
                  placeholder={activeProfile ? 'Message us…' : 'Finish onboarding to open chat'}
                  placeholderTextColor={withOpacity(theme.colors.text, 0.45)}
                  multiline
                  value={composerText}
                  onChangeText={setComposerText}
                  returnKeyType="send"
                  editable={Boolean(activeProfile)}
                  onSubmitEditing={() => {
                    if (Platform.OS === 'ios' && activeProfile) {
                      void handleSend();
                    }
                  }}
                />
                <Pressable
                  onPress={() => void handleSend()}
                  disabled={composerDisabled}
                  style={({ pressed }) => [
                    styles.sendButton,
                    {
                      backgroundColor: composerDisabled
                        ? withOpacity(theme.colors.border, 0.8)
                        : pressed
                        ? withOpacity(theme.colors.accent, 0.85)
                        : theme.colors.accent,
                    },
                  ]}
                >
                {isSending ? (
                    <ActivityIndicator color={mode === 'light' ? theme.colors.text : '#fff'} />
                  ) : (
                    <Ionicons
                      name="arrow-up"
                      size={20}
                      color={composerDisabled ? (mode === 'light' ? theme.colors.text : '#fff') : '#fff'}
                      style={styles.sendIcon}
                    />
                  )}
                </Pressable>
              </>
            )}
          </View>
          )}
        </View>
        <Modal
          visible={showFeedback}
          transparent
          animationType="fade"
          onRequestClose={handleCloseFeedback}
        >
          <Pressable
            style={styles.feedbackOverlay}
            onPress={() => {
              Keyboard.dismiss();
            }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 70 : 90}
              style={styles.feedbackKeyboardWrapper}
            >
              <Pressable onPress={(event) => event.stopPropagation()} style={styles.feedbackContentWrapper}>
                <View style={[styles.feedbackPanel, { backgroundColor: theme.colors.surface }]}>
                  <Text style={[styles.feedbackTitle, { color: theme.colors.text }]}>How did we do?</Text>
                  <View style={styles.ratingRow}>
                    {[
                      { value: 'positive', label: 'Great' },
                      { value: 'neutral', label: 'Meh' },
                      { value: 'negative', label: 'Needs work' },
                    ].map((option) => (
                      <Pressable
                        key={option.value}
                        onPress={() => setFeedbackRating(option.value as 'positive' | 'neutral' | 'negative')}
                        style={[
                          styles.ratingButton,
                          {
                            backgroundColor:
                              feedbackRating === option.value
                                ? theme.colors.accent
                                : theme.colors.surfaceAlt,
                            borderColor:
                              feedbackRating === option.value ? theme.colors.accent : withOpacity(theme.colors.text, 0.2),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.ratingButtonText,
                            { color: feedbackRating === option.value ? '#fff' : theme.colors.text },
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    style={[
                      styles.feedbackInput,
                      {
                        borderColor: withOpacity(theme.colors.text, 0.2),
                        color: theme.colors.text,
                        backgroundColor: withOpacity(theme.colors.surfaceAlt, 0.6),
                      },
                    ]}
                    value={feedbackNote}
                    onChangeText={setFeedbackNote}
                    placeholder="Notes (optional)"
                    placeholderTextColor={withOpacity(theme.colors.text, 0.4)}
                    multiline
                    onSubmitEditing={() => Keyboard.dismiss()}
                    scrollEnabled
                  />
                  <View style={styles.feedbackActions}>
                    <Pressable onPress={handleCloseFeedback} style={styles.feedbackCancel}>
                      <Text style={[styles.feedbackActionText, { color: theme.colors.textMuted }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={submitFeedback}
                      disabled={!feedbackRating || isSending}
                      style={[
                        styles.feedbackSubmit,
                        {
                          backgroundColor: feedbackRating ? theme.colors.accent : withOpacity(theme.colors.text, 0.3),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.feedbackActionText,
                          {
                            color: mode === 'light' ? '#fff' : theme.colors.text,
                          },
                        ]}
                      >
                        Submit
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme, mode: ThemeMode) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    keyboardAvoiding: {
      flex: 1,
    },
    flex: {
      flex: 1,
      paddingTop: 0,
      paddingHorizontal: 0,
    },
    headerGlass: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      marginBottom: 0,
      zIndex: 2,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      marginRight: 16,
    },
    headerText: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 19,
      fontWeight: '700',
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 6,
      shadowColor: theme.colors.success,
      shadowRadius: 10,
      shadowOpacity: 0.6,
      shadowOffset: { width: 0, height: 0 },
      elevation: 3,
    },
    statusLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.1,
    },
    messagesWrapper: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 12,
      marginTop: 0,
      position: 'relative',
    },
    messagesContent: {
      paddingBottom: 22,
      paddingTop: 12,
    },
    messageRow: {
      marginBottom: 32,
    },
    messageBubble: {
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderRadius: 24,
      maxWidth: '85%',
    },
    userBubble: {
      alignSelf: 'flex-end',
    },
    agentBubble: {
      alignSelf: 'flex-start',
    },
    messageText: {
      fontSize: 16,
      lineHeight: 24,
    },
    metadataRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },
    metadataRowRight: {
      alignSelf: 'flex-end',
      justifyContent: 'flex-end',
    },
    metadataText: {
      fontSize: 11,
    },
    metadataIcon: {
      marginTop: 2,
    },
    quickActions: {
      marginTop: 10,
      marginBottom: 12,
      paddingLeft: 24,
      paddingRight: 16,
      paddingTop: 4,
      paddingBottom: 4,
      position: 'relative',
    },
    quickActionsContent: {
      paddingBottom: 4,
      paddingRight: 32,
      paddingLeft: 16,
    },
    quickActionsFade: {
      position: 'absolute',
      right: 4,
      top: 0,
      bottom: 0,
      width: 48,
      pointerEvents: 'none',
    },
    successAnimationOverlay: {
      position: 'absolute',
      bottom: -4,
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      marginHorizontal: 12,
      backgroundColor: withOpacity(theme.colors.surface, 0.0),
      borderRadius: 28,
      zIndex: 2,
      elevation: 4,
      pointerEvents: 'none',
    },
    successAnimationText: {
      marginTop: 6,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    endSessionHeader: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 12,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.danger, 0.4),
    },
    statusMessage: {
      padding: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusMessageText: {
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      maxWidth: 240,
    },
    quickChip: {
      borderRadius: 18,
      paddingVertical: 8,
      paddingHorizontal: 16,
      marginRight: 8,
      borderWidth: 0,
      minHeight: 38,
      justifyContent: 'center',
    },
    quickChipText: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.03,
      textTransform: 'none',
    },
    endSessionChip: {
      backgroundColor: withOpacity(theme.colors.danger, 0.12),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.danger,
    },
    composerOuter: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 30,
      marginHorizontal: 12,
      marginBottom: 14,
      borderWidth: StyleSheet.hairlineWidth,
      shadowColor: '#000',
      shadowOpacity: mode === 'dark' ? 0.25 : 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    input: {
      flex: 1,
      minHeight: 6,
      maxHeight: 180,
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingVertical: 14,
      fontSize: 16,
    },
    sendButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 12,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    sendIcon: {
      marginTop: -2,
    },
    ticketClosedCopy: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    feedbackOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    feedbackKeyboardWrapper: {
      width: '100%',
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    feedbackContentWrapper: {
      width: '100%',
      maxWidth: 380,
      borderRadius: 32,
      overflow: 'hidden',
    },
    feedbackPanel: {
      borderRadius: 32,
      padding: 20,
      paddingBottom: 30,
    },
    feedbackTitle: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 12,
    },
    ratingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    ratingButton: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 20,
      paddingVertical: 10,
      marginHorizontal: 4,
      alignItems: 'center',
    },
    ratingButtonText: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    feedbackInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 16,
      minHeight: 80,
      padding: 12,
      textAlignVertical: 'top',
      marginBottom: 12,
    },
    feedbackActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    feedbackCancel: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginRight: 12,
    },
    feedbackSubmit: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 16,
    },
    feedbackActionText: {
      fontWeight: '600',
    },
  });
