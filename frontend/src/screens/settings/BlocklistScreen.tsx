import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';

type BlockedCaller = {
  id: string;
  caller_number: string | null;
  reason: string | null;
  created_at: string;
};

export default function BlocklistScreen() {
  const { activeProfile } = useProfile();
  const [blocked, setBlocked] = useState<BlockedCaller[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');

  const loadBlocked = async () => {
    if (!activeProfile) return;
    setLoading(true);
    try {
      const data = await authorizedFetch(`/fraud/blocked-callers?profileId=${activeProfile.id}`);
      setBlocked(data?.blocked_callers ?? []);
    } catch {
      setBlocked([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBlocked();
  }, [activeProfile]);

  const addBlocked = async () => {
    if (!input.trim()) return;
    if (!activeProfile) return;
    await authorizedFetch('/fraud/blocked-callers', {
      method: 'POST',
      body: JSON.stringify({
        profileId: activeProfile.id,
        callerNumber: input.trim(),
        reason: 'manual',
      }),
    });
    setInput('');
    loadBlocked();
  };

  const removeBlocked = async (blockId: string) => {
    await authorizedFetch(`/fraud/blocked-callers/${blockId}`, { method: 'DELETE' });
    loadBlocked();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Blocklist</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Add caller number…"
          placeholderTextColor="#8aa0c6"
          value={input}
          onChangeText={setInput}
        />
        <TouchableOpacity style={styles.addButton} onPress={addBlocked}>
          <Text style={styles.addText}>Block</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={blocked}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadBlocked} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View>
              <Text style={styles.cardText}>{item.caller_number ?? 'Unknown number'}</Text>
              <Text style={styles.meta}>{item.reason ?? 'auto'}</Text>
            </View>
            <TouchableOpacity onPress={() => removeBlocked(item.id)}>
              <Text style={styles.remove}>Unblock</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No blocked callers.</Text>}
      />
      {!activeProfile ? (
        <Text style={styles.warning}>Finish onboarding to load the blocklist.</Text>
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
  meta: {
    color: '#8aa0c6',
    fontSize: 12,
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
