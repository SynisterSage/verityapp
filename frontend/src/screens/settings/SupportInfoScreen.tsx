import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context/ThemeContext';
import { useProfile } from '../../context/ProfileContext';
import SettingsHeader from '../../components/common/SettingsHeader';
import { navigateToSupportPortal, navigateToSupportResource } from '../../navigation/rootNavigator';
import { withOpacity } from '../../utils/color';
import { SUPPORT_PORTAL_RESOURCES, SupportResourceEntry } from '../../data/supportResources';
import { createSupportBugReport } from '../../services/support';

const BUG_TOPICS = [
  'Calls & screening',
  'Alerts & activity',
  'Support portal',
  'Performance',
  'Account & settings',
  'Other',
] as const;

export default function SupportInfoScreen() {
  const { theme } = useTheme();
  const { activeProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const scrollPadding = Math.max(insets.bottom, 16);
  const [bugModalVisible, setBugModalVisible] = useState(false);
  const [bugTopic, setBugTopic] = useState<(typeof BUG_TOPICS)[number]>('Calls & screening');
  const [bugDetails, setBugDetails] = useState('');
  const [submittingBug, setSubmittingBug] = useState(false);
  const [isBugKeyboardVisible, setIsBugKeyboardVisible] = useState(false);
  const bugModalAnim = useRef(new Animated.Value(0)).current;
  const canReportBug = Boolean(activeProfile?.id);

  const handleSupportPress = useCallback(() => {
    navigateToSupportPortal();
  }, []);

  const openBugModal = useCallback(() => {
    setBugModalVisible(true);
  }, []);

  const closeBugModal = useCallback(() => {
    if (submittingBug) {
      return;
    }
    setBugModalVisible(false);
    setBugDetails('');
    setBugTopic('Calls & screening');
  }, [submittingBug]);

  const submitBugReport = useCallback(async () => {
    if (!activeProfile?.id) {
      Alert.alert('No profile selected', 'Pick a profile first, then submit the bug report.');
      return;
    }
    const trimmed = bugDetails.trim();
    if (trimmed.length < 10) {
      Alert.alert('Add more detail', 'Please include at least a short description of what happened.');
      return;
    }
    setSubmittingBug(true);
    try {
      await createSupportBugReport(activeProfile.id, {
        topic: bugTopic,
        details: trimmed,
        metadata: {
          source: 'settings_support_info',
          platform: Platform.OS,
        },
      });
      setBugModalVisible(false);
      setBugDetails('');
      setBugTopic('Calls & screening');
      Alert.alert('Bug report sent', 'Thanks. Our team will review it shortly.');
    } catch (error) {
      console.warn('Failed to submit bug report', error);
      Alert.alert('Could not send report', 'Please try again in a moment.');
    } finally {
      setSubmittingBug(false);
    }
  }, [activeProfile?.id, bugDetails, bugTopic]);

  useEffect(() => {
    if (!bugModalVisible) {
      bugModalAnim.setValue(0);
      return;
    }
    Animated.timing(bugModalAnim, {
      toValue: 1,
      duration: 230,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [bugModalAnim, bugModalVisible]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setIsBugKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setIsBugKeyboardVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleModalBackdropPress = useCallback(() => {
    if (isBugKeyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    closeBugModal();
  }, [closeBugModal, isBugKeyboardVisible]);

  const modalBackdropOpacity = bugModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const modalCardOpacity = bugModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  });
  const modalCardTranslateY = bugModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });
  const modalCardScale = bugModalAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1],
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={[]}>
      <SettingsHeader title="Support" subtitle="Chat with our safety team" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: scrollPadding }]}
      >
        <View style={[styles.resourcesSection, { marginBottom: 24 }]}>
          <Text
            style={[
              styles.sectionHeader,
              { color: theme.colors.textMuted, fontWeight: '600', marginBottom: 10 },
            ]}
          >
            RESOURCES
          </Text>
          <View style={styles.resourcesGrid}>
            {SUPPORT_PORTAL_RESOURCES.map((resource: SupportResourceEntry) => (
              <Pressable
                key={resource.id}
                style={({ pressed }) => [
                  styles.resourceTile,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                onPress={() =>
                  navigateToSupportResource({ resource: resource.resource, title: resource.title })
                }
              >
                <Ionicons name={resource.icon as any} size={18} color={theme.colors.accent} style={styles.resourceIcon} />
                <Text style={[styles.resourceLabel, { color: theme.colors.text }]}>{resource.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View
          style={[
            styles.hero,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={[styles.heroIcon, { backgroundColor: withOpacity(theme.colors.accent, 0.15) }]}>
            <Ionicons name="help-circle-outline" size={24} color={theme.colors.accent} />
          </View>
          <View style={styles.heroText}>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Need support</Text>
            <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>
              Open the live chat to send us a message. Answers usually arrive within an hour, but can sometimes take up to a few hours during busy periods.
            </Text>
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Support portal</Text>
          <Text style={[styles.sectionBody, { color: theme.colors.textMuted }]}>
            We log every message so you have a timeline of your conversation. Tap below to jump into the portal.
          </Text>
          <Pressable
            onPress={handleSupportPress}
            style={({ pressed }) => [
              styles.chatButton,
              { backgroundColor: pressed ? withOpacity(theme.colors.accent, 0.85) : theme.colors.accent },
            ]}
          >
            <Text style={styles.chatButtonText}>Open support chat</Text>
          </Pressable>
        </View>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Report a bug</Text>
          <Text style={[styles.sectionBody, { color: theme.colors.textMuted }]}>
            Found something broken or confusing? Send a quick report directly to our dev-support queue.
          </Text>
          <Pressable
            onPress={openBugModal}
            disabled={!canReportBug}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                backgroundColor: pressed
                  ? withOpacity(theme.colors.accent, 0.2)
                  : withOpacity(theme.colors.accent, 0.14),
                opacity: canReportBug ? 1 : 0.55,
              },
            ]}
          >
            <Ionicons name="bug-outline" size={17} color={theme.colors.accent} />
            <Text style={[styles.secondaryButtonText, { color: theme.colors.accent }]}>Report a bug</Text>
          </Pressable>
        </View>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Other ways to reach us</Text>
          <Pressable style={styles.detailRow} onPress={() => Linking.openURL('mailto:support@verityprotect.com')}>
            <Ionicons name="mail-outline" size={20} color={theme.colors.textMuted} />
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>support@verityprotect.com</Text>
          </Pressable>
          <Pressable style={styles.detailRow} onPress={() => Linking.openURL('tel:+17326558391')}>
            <Ionicons name="call-outline" size={20} color={theme.colors.textMuted} />
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>(732) 655-8391</Text>
          </Pressable>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={20} color={theme.colors.textMuted} />
            <Text style={[styles.detailValue, { color: theme.colors.textMuted }]}>Available 7am–10pm PT</Text>
          </View>
        </View>
      </ScrollView>
      <Modal visible={bugModalVisible} transparent animationType="none" onRequestClose={closeBugModal}>
        <View style={styles.modalContainer}>
          <Pressable style={styles.modalBackdropPressTarget} onPress={handleModalBackdropPress}>
            <Animated.View style={[styles.modalBackdrop, { opacity: modalBackdropOpacity }]} />
          </Pressable>
          <Animated.View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
              {
                opacity: modalCardOpacity,
                transform: [{ translateY: modalCardTranslateY }, { scale: modalCardScale }],
              },
              styles.modalCardLift,
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Report a Bug</Text>
            <Text style={[styles.modalSubtitle, { color: theme.colors.textMuted }]}>
              Share what happened and where you saw it.
            </Text>
            <Text style={[styles.modalFieldLabel, { color: theme.colors.textMuted }]}>Topic</Text>
            <View style={styles.topicWrap}>
              {BUG_TOPICS.map((topic) => {
                const selected = bugTopic === topic;
                return (
                  <Pressable
                    key={topic}
                    onPress={() => setBugTopic(topic)}
                    style={({ pressed }) => [
                      styles.topicChip,
                      {
                        borderColor: selected
                          ? theme.colors.accent
                          : withOpacity(theme.colors.textMuted, 0.35),
                        backgroundColor: selected
                          ? withOpacity(theme.colors.accent, 0.16)
                          : withOpacity(theme.colors.surfaceAlt, pressed ? 0.95 : 1),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.topicChipText,
                        { color: selected ? theme.colors.accent : theme.colors.textMuted },
                      ]}
                    >
                      {topic}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.modalFieldLabel, { color: theme.colors.textMuted }]}>Details</Text>
            <TextInput
              value={bugDetails}
              onChangeText={setBugDetails}
              placeholder="What happened, what you expected, and roughly where in the app."
              placeholderTextColor={withOpacity(theme.colors.textMuted, 0.8)}
              multiline
              textAlignVertical="top"
              editable={!submittingBug}
              style={[
                styles.modalInput,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: withOpacity(theme.colors.surfaceAlt, 0.9),
                },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: withOpacity(theme.colors.surfaceAlt, 0.95) }]}
                onPress={closeBugModal}
                disabled={submittingBug}
              >
                <Text style={[styles.modalButtonText, { color: theme.colors.textMuted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  {
                    backgroundColor: theme.colors.accent,
                    opacity: submittingBug ? 0.7 : 1,
                  },
                ]}
                onPress={submitBugReport}
                disabled={submittingBug}
              >
                {submittingBug ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>Send report</Text>
                )}
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 0,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    padding: 20,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: -18,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 14,
    marginTop: 4,
    lineHeight: 20,
  },
  card: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  chatButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
  },
  chatButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: 8,
    paddingVertical: 13,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  detailValue: {
    marginLeft: 8,
    fontSize: 14,
  },
  resourcesSection: {
    marginBottom: 16,
  },
  resourcesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  resourceTile: {
    width: '48%',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  resourceIcon: {
    marginRight: 8,
  },
  resourceLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  modalBackdropPressTarget: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  modalCardLift: {
    marginTop: -18,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  modalFieldLabel: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  topicWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topicChip: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  topicChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalInput: {
    minHeight: 120,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    minWidth: 120,
  },
  modalButtonText: {
    fontWeight: '700',
    fontSize: 15,
  },
  modalButtonPrimaryText: {
    color: '#fff',
  },
});
