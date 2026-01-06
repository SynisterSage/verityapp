import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';

type SafePhrase = {
  id: string;
  phrase: string;
  created_at: string;
};

export default function OnboardingSafePhrasesScreen({ navigation }: { navigation: any }) {
  const { activeProfile } = useProfile();
  const [input, setInput] = useState('');
  const [phrases, setPhrases] = useState<SafePhrase[]>([]);
  const [error, setError] = useState('');

  const loadPhrases = async () => {
    if (!activeProfile) return;
    const data = await authorizedFetch(`/fraud/safe-phrases?profileId=${activeProfile.id}`);
    setPhrases(data?.safe_phrases ?? []);
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Safe Phrases</Text>
      <Text style={styles.subtitle}>
        These reduce false positives (e.g., “It’s me, I’m safe”).
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Add a phrase…"
          placeholderTextColor="#8aa0c6"
          value={input}
          onChangeText={setInput}
        />
        <TouchableOpacity style={styles.addButton} onPress={addPhrase}>
          <Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={phrases}
        keyExtractor={(item) => item.id}
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

      <View style={styles.footer}>
        <TouchableOpacity onPress={() => navigation.navigate('OnboardingInviteFamily')}>
          <Text style={styles.link}>Skip for now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('OnboardingInviteFamily')}>
          <Text style={styles.primaryButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
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
  },
  subtitle: {
    color: '#b5c0d3',
    marginTop: 6,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
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
    marginTop: 20,
  },
  footer: {
    marginTop: 24,
    gap: 12,
  },
  link: {
    color: '#8ab4ff',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
    marginBottom: 6,
  },
});
