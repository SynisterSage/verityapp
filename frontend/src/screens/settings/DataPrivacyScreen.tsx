import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

type Section = {
  title: string;
  body?: string;
  bullets?: string[];
};

const SECTIONS: Section[] = [
  {
    title: 'Overview',
    body:
      'SafeCall helps caretakers monitor calls for potential fraud. We collect only what we need to provide the service and keep it secure.',
  },
  {
    title: 'What we collect',
    bullets: [
      'Account and profile details (name, phone number, caregiver relationships).',
      'Call metadata (caller number, timestamps, duration).',
      'Recordings and transcripts tied to a profile.',
      'Fraud analysis signals (keywords, risk score, feedback).',
    ],
  },
  {
    title: 'How we use it',
    bullets: [
      'Provide call playback, transcripts, and activity history.',
      'Detect scam patterns and highlight high-risk calls.',
      'Send alerts by email or SMS when enabled.',
      'Improve accuracy with your feedback (safe vs fraud).',
      'Push notifications are planned but not yet available.',
    ],
  },
  {
    title: 'Where your data lives',
    bullets: [
      'Supabase: database and private file storage.',
      'Twilio: call routing and recordings.',
      'Azure Speech: transcription processing.',
      'Resend: email notifications.',
    ],
  },
  {
    title: 'Who can access it',
    bullets: [
      'Only the caretaker and invited family members on a profile.',
      'Row-level security policies restrict access by profile membership.',
    ],
  },
  {
    title: 'Retention & deletion',
    bullets: [
      'Recordings and transcripts are retained for 90 days.',
      'Call deletion and profile deletion will be available in a future update.',
    ],
  },
  {
    title: 'Your controls',
    bullets: [
      'Invite or remove family members.',
      'Manage safe phrases and blocked callers.',
      'Control email and SMS alert preferences.',
    ],
  },
  {
    title: 'Legal & consent',
    bullets: [
      'SafeCall is not an emergency service.',
      'You are responsible for obtaining any required consent to record calls.',
      'We do not sell your personal data.',
    ],
  },
];

export default function DataPrivacyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#e4ebf7" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Data & Privacy</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.body ? <Text style={styles.body}>{section.body}</Text> : null}
            {section.bullets
              ? section.bullets.map((item) => (
                  <View key={item} style={styles.bulletRow}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))
              : null}
          </View>
        ))}
        <Text style={styles.footnote}>Last updated: January 2026</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 0,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121a26',
    borderWidth: 1,
    borderColor: '#1f2a3a',
  },
  headerTitle: {
    color: '#f5f7fb',
    fontSize: 26,
    fontWeight: '700',
    marginLeft: 12,
  },
  content: {
    paddingBottom: 140,
    gap: 12,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
  },
  sectionTitle: {
    color: '#f5f7fb',
    fontWeight: '600',
    marginBottom: 8,
  },
  body: {
    color: '#d2daea',
    lineHeight: 20,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
  },
  bullet: {
    color: '#8aa0c6',
    marginRight: 8,
    lineHeight: 20,
  },
  bulletText: {
    color: '#d2daea',
    flex: 1,
    lineHeight: 20,
  },
  footnote: {
    color: '#7385a6',
    textAlign: 'center',
    marginTop: 8,
    fontSize: 12,
  },
});
