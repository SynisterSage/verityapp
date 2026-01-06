import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';

type SafePhrase = {
  id: string;
  phrase: string;
  created_at: string;
};

export default function SafePhrasesScreen() {
  const { activeProfile } = useProfile();
  const [phrases, setPhrases] = useState<SafePhrase[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');

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
    <View style={styles.container}>
      <Text style={styles.title}>Safe Phrases</Text>
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

      <FlatList
        data={phrases}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadPhrases} />}
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
      {!activeProfile ? (
        <Text style={styles.warning}>Finish onboarding to load safe phrases.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f5f7fb',
    marginBottom: 16,
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
});
