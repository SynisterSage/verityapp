import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';

type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

export default function InviteFamilyScreen({ navigation }: { navigation: any }) {
  const { activeProfile } = useProfile();
  const [email, setEmail] = useState('');
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [error, setError] = useState('');

  const loadInvites = async () => {
    if (!activeProfile) return;
    const data = await authorizedFetch(`/profiles/${activeProfile.id}/invites`);
    setInvites(data?.invites ?? []);
  };

  useEffect(() => {
    loadInvites();
  }, [activeProfile]);

  const addInvite = async () => {
    if (!email.trim() || !activeProfile) return;
    setError('');
    try {
      await authorizedFetch(`/profiles/${activeProfile.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setEmail('');
      loadInvites();
    } catch (err: any) {
      setError(err?.message || 'Failed to add invite.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invite Family</Text>
      <Text style={styles.subtitle}>
        Add trusted family members who can review alerts and recordings.
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#8aa0c6"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TouchableOpacity style={styles.addButton} onPress={addInvite}>
          <Text style={styles.addText}>Invite</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={invites}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View>
              <Text style={styles.cardText}>{item.email}</Text>
              <Text style={styles.meta}>{item.status}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No invites yet.</Text>}
      />

      <View style={styles.footer}>
        <TouchableOpacity onPress={() => navigation.navigate('OnboardingAlerts')}>
          <Text style={styles.link}>Skip for now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('OnboardingAlerts')}>
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
  },
  cardText: {
    color: '#f1f4fa',
  },
  meta: {
    color: '#8aa0c6',
    fontSize: 12,
    marginTop: 4,
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
