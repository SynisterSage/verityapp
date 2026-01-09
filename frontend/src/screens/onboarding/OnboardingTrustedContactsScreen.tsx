import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { selectContacts } from '../../native/ContactPicker';

type DeviceContact = {
  id: string;
  name: string;
  numbers: string[];
};

type ContactMapEntry = {
  name: string;
  numbers: string[];
};

function normalizePhoneNumber(input: string) {
  const raw = input.trim();
  if (!raw) return '';
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (hasPlus) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

function contactMapKey(profileId: string) {
  return `trusted_contacts_map:${profileId}`;
}

async function readContactMap(profileId: string) {
  const raw = await AsyncStorage.getItem(contactMapKey(profileId));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, ContactMapEntry | string[]>;
    const normalized: Record<string, ContactMapEntry> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        normalized[key] = { name: 'Unknown', numbers: value };
      } else if (value && typeof value === 'object') {
        const numbers = Array.isArray(value.numbers) ? value.numbers : [];
        normalized[key] = { name: value.name ?? 'Unknown', numbers };
      }
    });
    return normalized;
  } catch {
    return {};
  }
}

async function writeContactMap(profileId: string, map: Record<string, ContactMapEntry>) {
  await AsyncStorage.setItem(contactMapKey(profileId), JSON.stringify(map));
}

export default function OnboardingTrustedContactsScreen({ navigation }: { navigation: any }) {
  const { activeProfile } = useProfile();
  const [importing, setImporting] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [error, setError] = useState('');
  const [importedContacts, setImportedContacts] = useState<DeviceContact[]>([]);

  const handleImport = async () => {
    if (!activeProfile) return;
    setError('');
    setImporting(true);
    try {
      const pickedContacts = await selectContacts();
      const normalized = pickedContacts
        .map((contact) => {
          const numbers = (contact.numbers ?? [])
            .map((number) => normalizePhoneNumber(number))
            .filter(Boolean);
          if (!numbers.length) return null;
          return {
            id: contact.id,
            name: contact.name || 'Unknown',
            numbers: Array.from(new Set(numbers)),
          };
        })
        .filter(Boolean) as DeviceContact[];
      if (normalized.length === 0) {
        setImporting(false);
        return;
      }
      const numbers = Array.from(
        new Set(normalized.flatMap((contact) => contact.numbers))
      );
      await authorizedFetch('/fraud/trusted-contacts', {
        method: 'POST',
        body: JSON.stringify({
          profileId: activeProfile.id,
          callerNumbers: numbers,
          source: 'contacts',
        }),
      });
      const contactMap = await readContactMap(activeProfile.id);
      normalized.forEach((contact) => {
        contactMap[contact.id] = { name: contact.name, numbers: contact.numbers };
      });
      await writeContactMap(activeProfile.id, contactMap);
      setAddedCount(numbers.length);
      setImportedContacts(normalized);
    } catch (err: any) {
      setError(err?.message || 'Failed to import contacts.');
    } finally {
      setImporting(false);
    }
  };

  const helperText = useMemo(() => {
    if (addedCount > 0) {
      return 'Trusted contacts can call without entering the passcode.';
    }
    return 'Trusted contacts can call without entering the passcode.';
  }, [addedCount]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Trusted Contacts</Text>
        <Text style={styles.subtitle}>{helperText}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Import from your phone</Text>
          <Text style={styles.cardBody}>
            Choose contacts you trust. They will skip the passcode when calling.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, importing && styles.primaryDisabled]}
            onPress={handleImport}
            disabled={importing}
          >
            <Text style={styles.primaryButtonText}>
              {importing ? 'Importing…' : 'Import contacts'}
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionTitle}>Imported contacts</Text>
        <View style={styles.listCard}>
          {importedContacts.length === 0 ? (
            <Text style={styles.emptyText}>No trusted contacts yet.</Text>
          ) : (
            importedContacts.map((contact) => (
              <View key={contact.id} style={styles.contactRow}>
                <View>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactNumbers}>
                    {contact.numbers.slice(0, 2).join(', ')}
                    {contact.numbers.length > 2 ? '…' : ''}
                  </Text>
                </View>
                <Text style={styles.contactBadge}>Trusted</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity onPress={() => navigation.navigate('OnboardingSafePhrases')}>
          <Text style={styles.link}>Skip for now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('OnboardingSafePhrases')}
        >
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
  content: {
    paddingBottom: 24,
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
  card: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#202c3c',
    gap: 10,
  },
  sectionTitle: {
    color: '#98a7c2',
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  listCard: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    overflow: 'hidden',
  },
  contactRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1b2534',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactName: {
    color: '#f1f4fa',
    fontWeight: '600',
  },
  contactNumbers: {
    color: '#8aa0c6',
    fontSize: 12,
    marginTop: 2,
  },
  contactBadge: {
    color: '#8ab4ff',
    fontWeight: '600',
    fontSize: 12,
  },
  emptyText: {
    color: '#8aa0c6',
    textAlign: 'center',
    paddingVertical: 20,
  },
  cardTitle: {
    color: '#f5f7fb',
    fontWeight: '600',
    fontSize: 16,
  },
  cardBody: {
    color: '#8aa0c6',
  },
  primaryButton: {
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  footer: {
    gap: 12,
    paddingBottom: 6,
  },
  link: {
    color: '#8ab4ff',
    textAlign: 'center',
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
    marginTop: 10,
  },
});
