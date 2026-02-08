import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';

import { useTheme } from '../../context/ThemeContext';
import { navigateToSupportPortal } from '../../navigation/rootNavigator';
import { withOpacity } from '../../utils/color';

const FAQ_ITEMS = [
  {
    question: 'Report a scam or suspicious call',
    answer: 'Share the caller number, transcript, and what made it feel unsafe so we can prioritize it.',
  },
  {
    question: 'Billing or account questions',
    answer: 'Tell us what you expected to be charged or where the setup stalled—we can explain the bill quickly.',
  },
  {
    question: 'Technical help',
    answer: 'Need to reset your PIN, sync a new device, or review notifications? Drop it in the chat.',
  },
];

export default function SupportInfoScreen() {
  const { theme } = useTheme();
  const handleSupportPress = useCallback(() => {
    navigateToSupportPortal();
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.heroIcon, { backgroundColor: withOpacity(theme.colors.accent, 0.15) }]}>
            <Ionicons name="help-circle-outline" size={24} color={theme.colors.accent} />
          </View>
          <View style={styles.heroText}>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Need support?</Text>
            <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>Open the live chat to send us a message—answers usually arrive in minutes.</Text>
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>          
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Support chat</Text>
          <Text style={[styles.sectionBody, { color: theme.colors.textMuted }]}>We log every message so you have a timeline of your conversation. Tap below to jump in.</Text>
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
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Need quick answers?</Text>
          {FAQ_ITEMS.map((item) => (
            <View key={item.question} style={[styles.faqRow, { borderBottomColor: withOpacity(theme.colors.text, 0.08) }]}>
              <Text style={[styles.faqQuestion, { color: theme.colors.text }]}>{item.question}</Text>
              <Text style={[styles.faqAnswer, { color: theme.colors.textMuted }]}>{item.answer}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>          
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Other ways to reach us</Text>
          <View style={styles.detailRow}>
            <Ionicons name="mail-outline" size={20} color={theme.colors.textMuted} />
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>support@verityprotect.com</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={20} color={theme.colors.textMuted} />
            <Text style={[styles.detailValue, { color: theme.colors.textMuted }]}>Available 7am–10pm PT</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    padding: 20,
    marginBottom: 18,
    borderWidth: StyleSheet.hairlineWidth,
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
  faqRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '600',
  },
  faqAnswer: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
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
});
