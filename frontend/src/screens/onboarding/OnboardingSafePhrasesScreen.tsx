import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';

type SafePhrase = {
  id: string;
  phrase: string;
  created_at: string;
};

export default function OnboardingSafePhrasesScreen({ navigation }: { navigation: any }) {
  const { activeProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const [phrases, setPhrases] = useState<SafePhrase[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const shimmer = useMemo(() => new Animated.Value(0.6), []);
  const skeletonRows = useMemo(
    () => Array.from({ length: 3 }, (_, i) => `safe-phrase-skeleton-${i}`),
    []
  );

  const helperItems = [
    {
      icon: 'shield-checkmark',
      color: '#4ade80',
      text: 'Safe phrases automatically lower the fraud risk score of any incoming caller.',
    },
    {
      icon: 'flash',
      color: '#2d6df6',
      text: 'Matches are instantly flagged as "Verified Context" for your circle to see.',
    },
  ];

  const loadPhrases = async () => {
    if (!activeProfile) return;
    setLoading(true);
    const data = await authorizedFetch(`/fraud/safe-phrases?profileId=${activeProfile.id}`);
    setPhrases(data?.safe_phrases ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadPhrases();
  }, [activeProfile]);

  const addPhrase = async () => {
    if (!input.trim() || !activeProfile) return;
    setError('');
    try {
      await authorizedFetch('/fraud/safe-phrases', {
        method: 'POST',
        body: JSON.stringify({ profileId: activeProfile.id, phrase: input.trim() }),
      });
      setInput('');
      loadPhrases();
    } catch (err: any) {
      setError(err?.message || 'Failed to add phrase.');
    }
  };

  const removePhrase = async (phraseId: string) => {
    await authorizedFetch(`/fraud/safe-phrases/${phraseId}`, { method: 'DELETE' });
    loadPhrases();
  };

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

  const showSkeleton = loading;

  return (
    <KeyboardAvoidingView style={styles.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <OnboardingHeader chapter="Phrases" activeStep={6} totalSteps={9} />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: Math.max(insets.bottom, 32) + 120,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerSection}>
            <Text style={styles.title}>Safe Phrases</Text>
            <Text style={styles.subtitle}>
              Whitelist phrases that are normal for you to help our AI recognize safe calls.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>Add new phrase</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="e.g. Golf"
              placeholderTextColor="#8aa0c6"
              value={input}
              onChangeText={setInput}
            />
            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                { opacity: pressed || !input.trim() ? 0.3 : 1 },
              ]}
              onPress={addPhrase}
              disabled={!input.trim()}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionLabel}>Active safe phrases</Text>
          {showSkeleton ? (
            <View style={styles.skeletonWrapper}>
              {skeletonRows.map((key) => (
                <Animated.View key={key} style={[styles.skeletonCard, { opacity: shimmer }]}>
                  <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
                </Animated.View>
              ))}
            </View>
          ) : phrases.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubble-ellipses" size={24} color="#4ade80" />
              </View>
              <Text style={styles.emptyText}>No topics added yet.</Text>
            </View>
          ) : (
            phrases.map((item) => (
              <View key={item.id} style={styles.phraseCard}>
                <View style={styles.phraseIcon}>
                  <Ionicons name="chatbubble-ellipses" size={20} color="#22c55e" />
                </View>
                <Text style={styles.phraseText}>{item.phrase}</Text>
                <Pressable style={styles.deleteButton} onPress={() => removePhrase(item.id)}>
                  <Ionicons name="trash" size={18} color="#e11d48" />
                </Pressable>
              </View>
            ))
          )}

          <HowItWorksCard items={helperItems} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={() => navigation.navigate('OnboardingInviteFamily')}
          >
            <Text style={styles.primaryButtonText}>Save Safe Topics</Text>
          </Pressable>
          <TouchableOpacity onPress={() => navigation.navigate('OnboardingInviteFamily')}>
            <Text style={styles.secondaryLink}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  screen: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 28,
  },
  headerSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.35,
    color: '#f5f7fb',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#8aa0c6',
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: '#8796b0',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 32,
    backgroundColor: '#121a26',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    color: '#e6ebf5',
    fontSize: 16,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2d6df6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#ff8a8a',
    marginBottom: 12,
  },
  emptyCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#121a26',
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0f1b2d',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyText: {
    color: '#8aa0c6',
  },
  phraseCard: {
    backgroundColor: '#121a26',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#1b2534',
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  phraseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0e2d18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phraseText: {
    flex: 1,
    color: '#f5f7fb',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1c1c22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 28,
    paddingTop: 16,
    backgroundColor: '#0b111b',
  },
  primaryButton: {
    height: 60,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#2d6df6',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
  secondaryLink: {
    color: '#8aa0c6',
    textAlign: 'center',
    fontWeight: '600',
  },
  skeletonWrapper: {
    backgroundColor: 'transparent',
    gap: 12,
    marginBottom: 12,
  },
  skeletonCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 16,
    backgroundColor: '#121a26',
    overflow: 'hidden',
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1b2534',
    marginBottom: 8,
  },
  skeletonLineShort: {
    width: '60%',
  },
  skeletonLineTiny: {
    width: '40%',
  },
});
