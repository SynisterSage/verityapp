import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';

type SafePhrase = {
  id: string;
  phrase: string;
  created_at: string;
};

export default function SafePhrasesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const [phrases, setPhrases] = useState<SafePhrase[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const shimmer = useRef(new Animated.Value(0.6)).current;

  const loadPhrases = async () => {
    if (!activeProfile) return;
    setLoading(true);
    try {
      const data = await authorizedFetch(`/fraud/safe-phrases?profileId=${activeProfile.id}`);
      setPhrases(data?.safe_phrases ?? []);
    } catch {
      setPhrases([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPhrases();
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

  const skeletonRows = useMemo(() => Array.from({ length: 3 }, (_, i) => `skeleton-${i}`), []);
  const showSkeleton = loading && phrases.length === 0;

  const addPhrase = async () => {
    if (!input.trim()) return;
    if (!activeProfile) return;
    await authorizedFetch('/fraud/safe-phrases', {
      method: 'POST',
      body: JSON.stringify({ profileId: activeProfile.id, phrase: input.trim() }),
    });
    setInput('');
    loadPhrases();
  };

  const removePhrase = async (phraseId: string) => {
    await authorizedFetch(`/fraud/safe-phrases/${phraseId}`, { method: 'DELETE' });
    loadPhrases();
  };

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#e4ebf7" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Safe Phrases</Text>
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Add phrase…"
          placeholderTextColor="#8aa0c6"
          value={input}
          onChangeText={setInput}
        />
        <TouchableOpacity style={styles.addButton} onPress={addPhrase}>
          <Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      </View>

      {showSkeleton ? (
        <View style={styles.listContent}>
          {skeletonRows.map((key) => (
            <Animated.View key={key} style={[styles.skeletonCard, { opacity: shimmer }]}>
              <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
              <View style={[styles.skeletonLine, styles.skeletonLineTiny]} />
            </Animated.View>
          ))}
        </View>
      ) : (
        <FlatList
          data={phrases}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadPhrases} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardText}>{item.phrase}</Text>
              <TouchableOpacity onPress={() => removePhrase(item.id)}>
                <Text style={styles.remove}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No safe phrases yet.</Text>}
        />
      )}
      {!activeProfile ? (
        <Text style={styles.warning}>Finish onboarding to load safe phrases.</Text>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 24,
    paddingTop: 16,
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
    fontSize: 28,
    fontWeight: '700',
    marginLeft: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#243247',
    borderRadius: 12,
    padding: 12,
    color: '#e6ebf5',
  },
  addButton: {
    backgroundColor: '#2d6df6',
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202c3c',
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardText: {
    color: '#f1f4fa',
  },
  remove: {
    color: '#ff9c9c',
  },
  empty: {
    color: '#8aa0c6',
    textAlign: 'center',
    marginTop: 40,
  },
  warning: {
    color: '#f7c16e',
    marginTop: 16,
  },
  listContent: {
    paddingBottom: 120,
  },
  skeletonCard: {
    backgroundColor: '#121a26',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#202c3c',
  },
  skeletonLine: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#1c2636',
    marginTop: 10,
  },
  skeletonLineShort: {
    width: '55%',
    marginTop: 2,
  },
  skeletonLineTiny: {
    width: '35%',
  },
});
