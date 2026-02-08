import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useNavigation } from '@react-navigation/native';

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

const QUICK_PROMPTS = [
  {
    label: 'Report scam',
    message: 'I need help reporting a suspicious call. The number was ___ and it mentioned ___.',
  },
  {
    label: 'Billing question',
    message: 'Can you explain the last charge on my account?'
  },
  {
    label: 'Technical help',
    message: 'I need assistance resetting my safety PIN and syncing a new device.',
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
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const { theme } = useTheme();
  const { refreshUnread } = useSupportContext();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerText, setComposerText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const lastAgentIdRef = useRef<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!activeProfile?.id) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchSupportMessages(activeProfile.id);
      setMessages(data);
      await markSupportMessagesRead(activeProfile.id);
      await refreshUnread();
    } catch (err) {
      console.warn('Failed to load support conversation', err);
    } finally {
      setLoading(false);
    }
  }, [activeProfile?.id, refreshUnread]);

  const playNotification = useCallback(async () => {
    try {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          require('../../../assets/sounds/support-notification.wav'),
          { shouldPlay: false }
        );
        soundRef.current = sound;
      }
      await soundRef.current.replayAsync();
    } catch (err) {
      console.warn('Failed to play support notification', err);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

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
      void playNotification();
    }
  }, [messages, playNotification]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

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
      await createSupportMessage(activeProfile.id, { content: trimmed });
      setComposerText('');
      setSelectedPrompt(null);
      await loadMessages();
      Keyboard.dismiss();
    } catch (err) {
      console.warn('Failed to send support message', err);
    } finally {
      setIsSending(false);
    }
  }, [activeProfile?.id, composerText, loadMessages]);

  const handlePromptPress = useCallback((prompt: { label: string; message: string }) => {
    setComposerText(prompt.message);
    setSelectedPrompt(prompt.label);
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

  return (
    <SafeAreaView
      edges={['bottom', 'top']}
      style={[styles.container, { backgroundColor: theme.colors.bg }]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 70}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[styles.content, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.header}>
              <View style={styles.headingCopy}>
                <Text style={[styles.title, { color: theme.colors.text }]}>Verity Support</Text>
                <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{headerSubtitle}</Text>
              </View>
              <Pressable
                onPress={() => navigation.goBack()}
                style={styles.closeButton}
                accessibilityLabel="Close support chat"
              >
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>
            <View style={[styles.body, { borderColor: withOpacity(theme.colors.text, 0.08) }]}>
              {statusMessage && !activeProfile ? (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>Support chat is ready</Text>
                  <Text style={[styles.emptyStateBody, { color: theme.colors.textMuted }]}>
                    Finish setting up your profile and the conversation will keep saving in one place.
                  </Text>
                </View>
              ) : null}
              <ScrollView
                ref={scrollRef}
                style={styles.messagesContainer}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  messages.map((message) => {
                    const isUser = message.sender === 'user';
                    return (
                      <View key={message.id} style={styles.messageRow}>
                        <View
                          style={[
                            styles.messageBubble,
                            isUser ? styles.messageRight : styles.messageLeft,
                            {
                              backgroundColor: isUser ? theme.colors.accent : theme.colors.surfaceAlt,
                            },
                          ]}
                        >
                          <Text style={[styles.messageText, { color: isUser ? '#fff' : theme.colors.text }]}>
                            {message.content}
                          </Text>
                          <Text
                            style={[
                              styles.messageTimestamp,
                              { color: isUser ? withOpacity('#fff', 0.8) : theme.colors.textMuted },
                            ]}
                          >
                            {formatTimestamp(message.created_at)}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
              <View style={styles.quickPrompts}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickPromptsContent}
                >
                  {QUICK_PROMPTS.map((prompt) => {
                    const active = prompt.label === selectedPrompt;
                    return (
                      <Pressable
                        key={prompt.label}
                        onPress={() => handlePromptPress(prompt)}
                        style={({ pressed }) => [
                          styles.promptChip,
                          {
                            backgroundColor: active
                              ? theme.colors.accent
                              : pressed
                              ? withOpacity(theme.colors.accent, 0.08)
                              : theme.colors.surfaceAlt,
                            borderColor: active ? theme.colors.accent : 'transparent',
                          },
                        ]}
                      >
                        <Text style={[styles.promptText, { color: active ? '#fff' : theme.colors.text }]}>
                          {prompt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
        <View style={[styles.composerOuter, { borderColor: withOpacity(theme.colors.text, 0.1) }]}>
          <TextInput
            style={[styles.input, { color: theme.colors.text }]}
            placeholder={activeProfile ? 'Send a message' : 'Finish onboarding to open chat'}
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
            disabled={isSending || !composerText.trim() || !activeProfile}
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor: pressed ? withOpacity(theme.colors.accent, 0.85) : theme.colors.accent,
                opacity: isSending || !composerText.trim() || !activeProfile ? 0.6 : 1,
              },
            ]}
          >
            {isSending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="arrow-up" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  content: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 32,
    padding: 24,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headingCopy: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  body: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    padding: 16,
    paddingBottom: 8,
    marginTop: 6,
  },
  emptyState: {
    alignItems: 'center',
    padding: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyStateBody: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingBottom: 12,
  },
  messageRow: {
    marginBottom: 10,
  },
  messageBubble: {
    padding: 14,
    borderRadius: 20,
    maxWidth: '80%',
  },
  messageLeft: {
    alignSelf: 'flex-start',
  },
  messageRight: {
    alignSelf: 'flex-end',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  messageTimestamp: {
    fontSize: 11,
    marginTop: 6,
  },
  quickPrompts: {
    marginTop: 12,
  },
  quickPromptsContent: {
    paddingVertical: 4,
  },
  promptChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
  },
  promptText: {
    fontWeight: '600',
    fontSize: 13,
  },
  composerOuter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  composer: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    fontSize: 16,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    fontSize: 15,
  },
  sendButton: {
    marginLeft: 12,
    width: 52,
    height: 52,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
