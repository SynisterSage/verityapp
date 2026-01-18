import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import SettingsHeader from '../../components/common/SettingsHeader';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';

type SafePhrase = {
  id: string;
  phrase: string;
  created_at: string;
};

const normalizePhrase = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const helperItems = [
  {
    icon: 'shield-checkmark',
    color: '#4ade80',
    text: 'Safe Phrases help confirm a caller is legitimate.',
  },
  {
    icon: 'flash',
    color: '#2d6df6',
    text: 'When a phrase is used, it helps lower the risk, but the call is still screened.',
  },
];

export default function SafePhrasesScreen() {
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const [phrases, setPhrases] = useState<SafePhrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const shimmer = useMemo(() => new Animated.Value(0.6), []);
  const skeletonRows = useMemo(() => Array.from({ length: 3 }, (_, i) => `safe-phrase-skeleton-${i}`), []);

  const loadPhrases = async ({ showLoading = false } = {}) => {
    if (!activeProfile) return;
    try {
      if (showLoading) {
        setLoading(true);
      }
      const data = await authorizedFetch(`/fraud/safe-phrases?profileId=${activeProfile.id}`);
      const normalized = (data?.safe_phrases ?? []).map((item: SafePhrase) => ({
        ...item,
        phrase: normalizePhrase(item.phrase),
      }));
      setPhrases(normalized);
    } catch {
      setPhrases([]);
    }
    if (showLoading) {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPhrases({ showLoading: true });
  }, [activeProfile]);

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

  const addPhrase = async () => {
    if (!input.trim() || !activeProfile || adding) return;
    setError('');
    setAdding(true);
    try {
      const phrase = normalizePhrase(input);
      await authorizedFetch('/fraud/safe-phrases', {
        method: 'POST',
        body: JSON.stringify({ profileId: activeProfile.id, phrase }),
      });
      setInput('');
      await loadPhrases();
    } catch (err: any) {
      setError(err?.message || 'Failed to add phrase.');
    } finally {
      setAdding(false);
    }
  };

  const removePhrase = async (phraseId: string) => {
    if (!phraseId || deletingId === phraseId) return;
    setDeletingId(phraseId);
    try {
      await authorizedFetch(`/fraud/safe-phrases/${phraseId}`, { method: 'DELETE' });
      loadPhrases();
    } finally {
      setDeletingId((current) => (current === phraseId ? null : current));
    }
  };

  const showSkeleton = loading && phrases.length === 0;

  return (
    <View style={styles.outer}>
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <SettingsHeader title="Safe Phrases" subtitle="Add phrases you normally say during calls." />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: Math.max(insets.bottom, 32),
              paddingTop: Math.max(insets.top, 12) + 0,

            },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                try {
                  await loadPhrases();
                } finally {
                  setRefreshing(false);
                }
              }}
              tintColor="#8ab4ff"
              colors={['#8ab4ff']}
            />
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <Text style={styles.sectionLabel}>Add new phrase</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="e.g. Golf"
              placeholderTextColor="#8aa0c6"
              value={input}
              onChangeText={setInput}
              returnKeyType="done"
              onSubmitEditing={addPhrase}
            />
            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                { opacity: pressed || !input.trim() || adding ? 0.3 : 1 },
              ]}
              onPress={addPhrase}
              disabled={!input.trim() || adding}
            >
              {adding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="add" size={24} color="#fff" />
              )}
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
                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => removePhrase(item.id)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? (
                      <ActivityIndicator size="small" color="#e11d48" />
                    ) : (
                      <Ionicons name="trash" size={18} color="#e11d48" />
                    )}
                  </Pressable>
                </View>
            ))
          )}

          <HowItWorksCard items={helperItems} />
          {!activeProfile ? (
            <Text style={styles.warning}>Finish onboarding to load safe phrases.</Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
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
    paddingTop: 20,
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
  skeletonWrapper: {
    backgroundColor: 'transparent',
    gap: 2,
    marginBottom: 12,
  },
  skeletonCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 16,
    backgroundColor: '#121a26',
    overflow: 'hidden',
    marginBottom: 12,
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
  warning: {
    color: '#f7c16e',
    marginTop: 16,
    textAlign: 'center',
  },
});
