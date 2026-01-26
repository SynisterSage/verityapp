import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';

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

export default function OnboardingSafePhrasesScreen({ navigation }: { navigation: any }) {
  const { activeProfile } = useProfile();
  const { theme } = useTheme();
  const styles = useMemo(() => createSafePhrasesStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const [phrases, setPhrases] = useState<SafePhrase[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const shimmer = useMemo(() => new Animated.Value(0.6), []);
  const skeletonRows = useMemo(
    () => Array.from({ length: 3 }, (_, i) => `safe-phrase-skeleton-${i}`),
    []
  );

  const placeholderColor = useMemo(
    () => withOpacity(theme.colors.textMuted, 0.6),
    [theme.colors.textMuted]
  );
  const helperItems = useMemo(
    () => [
      {
        icon: 'shield-checkmark',
        color: theme.colors.success,
        text: 'Safe Phrases help confirm a caller is legitimate.',
      },
      {
        icon: 'flash',
        color: theme.colors.accent,
        text: 'When a phrase is used, it helps lower the risk, but the call is still screened.',
      },
    ],
    [theme.colors.success, theme.colors.accent]
  );

  const loadPhrases = async () => {
    if (!activeProfile) return;
    setLoading(true);
    const data = await authorizedFetch(`/fraud/safe-phrases?profileId=${activeProfile.id}`);
    const normalizedPhrases = (data?.safe_phrases ?? []).map((item: SafePhrase) => ({
      ...item,
      phrase: normalizePhrase(item.phrase),
    }));
    setPhrases(normalizedPhrases);
    setLoading(false);
  };

  useEffect(() => {
    loadPhrases();
  }, [activeProfile]);

  const addPhrase = async () => {
    if (!input.trim() || !activeProfile) return;
    setError('');
    try {
      const phrase = normalizePhrase(input);
      await authorizedFetch('/fraud/safe-phrases', {
        method: 'POST',
        body: JSON.stringify({ profileId: activeProfile.id, phrase }),
      });
      setInput('');
      loadPhrases();
    } catch (err: any) {
      setError(err?.message || 'Failed to add phrase.');
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
    <View style={styles.outer}>
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <OnboardingHeader chapter="Phrases" activeStep={6} totalSteps={9} />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: Math.max(insets.bottom, 32) + 220,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.headerSection}>
            <Text style={styles.title}>Safe Phrases</Text>
            <Text style={styles.subtitle}>
              Add phrases that are normal for you to help identify safer calls.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>Add new phrase</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="e.g. Golf"
              placeholderTextColor={placeholderColor}
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
              <Ionicons name="add" size={24} color={theme.colors.surface} />
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
                <Ionicons name="chatbubble-ellipses" size={24} color={theme.colors.success} />
              </View>
              <Text style={styles.emptyText}>No topics added yet.</Text>
            </View>
          ) : (
            phrases.map((item) => (
              <View key={item.id} style={styles.phraseCard}>
                <View style={styles.phraseIcon}>
                  <Ionicons name="chatbubble-ellipses" size={20} color={theme.colors.success} />
                </View>
                <Text style={styles.phraseText}>{item.phrase}</Text>
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => removePhrase(item.id)}
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id ? (
                    <ActivityIndicator size="small" color={theme.colors.danger} />
                  ) : (
                    <Ionicons name="trash" size={18} color={theme.colors.danger} />
                  )}
                </Pressable>
              </View>
            ))
          )}

          <HowItWorksCard items={helperItems} />
        </ScrollView>

        <ActionFooter
          primaryLabel="Save Safe Topics"
          onPrimaryPress={() => navigation.navigate('OnboardingInviteFamily')}
          secondaryLabel="Skip for now"
          onSecondaryPress={() => navigation.navigate('OnboardingInviteFamily')}
        />
      </SafeAreaView>
    </View>
  );
}

const createSafePhrasesStyles = (theme: AppTheme) =>
  StyleSheet.create({
    outer: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    content: {
      paddingHorizontal: 28,
      paddingTop: 28,
      gap: 24,
    },
    headerSection: {
      marginBottom: 24,
    },
    title: {
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: -0.35,
      color: theme.colors.text,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 17,
      fontWeight: '500',
      color: theme.colors.textMuted,
    },
    sectionLabel: {
      fontSize: 12,
      letterSpacing: 1.5,
      color: theme.colors.textMuted,
      marginBottom: 12,
      textTransform: 'uppercase',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 60,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 32,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 16,
      gap: 12,
      marginBottom: 16,
    },
    input: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 16,
    },
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    error: {
      color: theme.colors.danger,
      marginBottom: 12,
    },
    emptyCard: {
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderStyle: 'dashed',
      padding: 24,
      alignItems: 'center',
      marginBottom: 16,
      backgroundColor: theme.colors.surfaceAlt,
    },
    emptyIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: withOpacity(theme.colors.success, 0.2),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    emptyText: {
      color: theme.colors.textMuted,
    },
    phraseCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
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
      backgroundColor: withOpacity(theme.colors.success, 0.18),
      alignItems: 'center',
      justifyContent: 'center',
    },
    phraseText: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
    deleteButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: withOpacity(theme.colors.text, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    skeletonWrapper: {
      backgroundColor: 'transparent',
      gap: 12,
      marginBottom: 12,
    },
    skeletonCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.15),
      padding: 16,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    skeletonLine: {
      height: 12,
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.15),
      marginBottom: 8,
    },
    skeletonLineShort: {
      width: '60%',
    },
    skeletonLineTiny: {
      width: '40%',
    },
  });
