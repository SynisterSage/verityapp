import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import EmptyState from '../../components/common/EmptyState';
import { getAllContacts, selectContacts } from '../../native/ContactPicker';

type TrustedContact = {
  id: string;
  caller_number: string | null;
  source: string | null;
  created_at: string;
};

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

export default function TrustedContactsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const [trusted, setTrusted] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const inputRef = useRef<TextInput>(null);
  const shimmer = useRef(new Animated.Value(0.6)).current;
  const listRef = useRef<FlatList<TrustedContact>>(null);

  const loadContactNames = async () => {
    if (!activeProfile) {
      setContactNames({});
      return;
    }
    const raw = await AsyncStorage.getItem(contactMapKey(activeProfile.id));
    if (!raw) {
      setContactNames({});
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, ContactMapEntry | string[]>;
      const map: Record<string, string> = {};
      Object.values(parsed).forEach((entry) => {
        if (Array.isArray(entry)) {
          entry.forEach((number) => {
            if (number) {
              map[number] = map[number] ?? 'Trusted contact';
            }
          });
        } else if (entry && typeof entry === 'object') {
          const name = entry.name ?? 'Trusted contact';
          entry.numbers.forEach((number) => {
            if (number) {
              map[number] = name;
            }
          });
        }
      });
      setContactNames(map);
    } catch {
      setContactNames({});
    }
  };

  const loadTrusted = async () => {
    if (!activeProfile) return;
    setLoading(true);
    try {
      const data = await authorizedFetch(
        `/fraud/trusted-contacts?profileId=${activeProfile.id}`
      );
      setTrusted(data?.trusted_contacts ?? []);
    } catch {
      setTrusted([]);
    }
    await loadContactNames();
    setLoading(false);
  };

  useEffect(() => {
    loadTrusted();
  }, [activeProfile]);

  useFocusEffect(
    useCallback(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, [])
  );

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
  const showSkeleton = loading && trusted.length === 0;

  const addTrustedNumbers = async (numbers: string[], source: 'manual' | 'contacts') => {
    if (!activeProfile || numbers.length === 0) return;
    await authorizedFetch('/fraud/trusted-contacts', {
      method: 'POST',
      body: JSON.stringify({
        profileId: activeProfile.id,
        callerNumbers: numbers,
        source,
      }),
    });
  };

  const addManual = async () => {
    const normalized = normalizePhoneNumber(input);
    if (!normalized || !activeProfile) return;
    await addTrustedNumbers([normalized], 'manual');
    setInput('');
    loadTrusted();
  };

  const removeTrusted = async (trustedId: string, shouldReload = true) => {
    await authorizedFetch(`/fraud/trusted-contacts/${trustedId}`, { method: 'DELETE' });
    if (shouldReload) {
      loadTrusted();
    }
  };

  const openContactPicker = async () => {
    setContactsError('');
    setContactsLoading(true);
    setContacts([]);
    setSelectedMap({});
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
        setContactsLoading(false);
        return;
      }
      setContacts(normalized);
      const initialSelection: Record<string, boolean> = {};
      normalized.forEach((contact) => {
        initialSelection[contact.id] = true;
      });
      setSelectedMap(initialSelection);
      setPickerOpen(true);
    } catch (err) {
      setContactsError((err as Error).message);
    } finally {
      setContactsLoading(false);
    }
  };

  const closeContactPicker = () => {
    setPickerOpen(false);
    setContacts([]);
    setSelectedMap({});
    setContactsLoading(false);
  };

  const toggleContact = (contactId: string) => {
    setSelectedMap((prev) => ({
      ...prev,
      [contactId]: !prev[contactId],
    }));
  };

  const selectAllContacts = () => {
    const next: Record<string, boolean> = {};
    contacts.forEach((contact) => {
      next[contact.id] = true;
    });
    setSelectedMap(next);
  };

  const importSelected = async () => {
    if (!activeProfile) return;
    const selectedContacts = contacts.filter((contact) => selectedMap[contact.id]);
    const numbers = Array.from(
      new Set(selectedContacts.flatMap((contact) => contact.numbers))
    );
    if (numbers.length === 0) {
      setPickerOpen(false);
      setContacts([]);
      setSelectedMap({});
      return;
    }
    await addTrustedNumbers(numbers, 'contacts');
    const contactMap = await readContactMap(activeProfile.id);
    selectedContacts.forEach((contact) => {
      contactMap[contact.id] = { name: contact.name, numbers: contact.numbers };
    });
    await writeContactMap(activeProfile.id, contactMap);
    setPickerOpen(false);
    setContacts([]);
    setSelectedMap({});
    loadTrusted();
  };

  const syncContacts = async () => {
    if (!activeProfile) return;
    setSyncing(true);
      setContactsError('');
    try {
      const contactMap = await readContactMap(activeProfile.id);
      const trackedIds = Object.keys(contactMap);
      if (trackedIds.length === 0) {
        setSyncing(false);
        return;
      }
      const rawContacts = await getAllContacts();
      const deviceContacts = rawContacts
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
      const byId = new Map(deviceContacts.map((contact) => [contact.id, contact]));
      const nextMap: Record<string, ContactMapEntry> = {};
      trackedIds.forEach((id) => {
        const contact = byId.get(id);
        if (!contact) return;
        if (contact.numbers.length === 0) return;
        nextMap[id] = { name: contact.name, numbers: contact.numbers };
      });

      const previousNumbers = new Set(
        Object.values(contactMap).flatMap((entry) => entry.numbers).filter(Boolean)
      );
      const nextNumbers = new Set(
        Object.values(nextMap).flatMap((entry) => entry.numbers).filter(Boolean)
      );

      const currentContacts = trusted.filter((entry) => entry.source === 'contacts');
      const currentNumberSet = new Set(
        currentContacts.map((entry) => entry.caller_number).filter(Boolean) as string[]
      );
      const numberToId = new Map(
        currentContacts
          .filter((entry) => entry.caller_number)
          .map((entry) => [entry.caller_number as string, entry.id])
      );

      const numbersToRemove = Array.from(previousNumbers).filter(
        (number) => !nextNumbers.has(number)
      );
      for (const number of numbersToRemove) {
        const trustedId = numberToId.get(number);
        if (trustedId) {
          await removeTrusted(trustedId, false);
        }
      }

      const numbersToAdd = Array.from(nextNumbers).filter(
        (number) => !currentNumberSet.has(number)
      );
      if (numbersToAdd.length > 0) {
        await addTrustedNumbers(numbersToAdd, 'contacts');
      }

      await writeContactMap(activeProfile.id, nextMap);
      loadTrusted();
    } catch (err) {
      setContactsError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const selectedCount = useMemo(
    () => Object.values(selectedMap).filter(Boolean).length,
    [selectedMap]
  );

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#e4ebf7" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trusted Contacts</Text>
      </View>
      <Text style={styles.subtitle}>
        Calls from trusted contacts skip the passcode and go straight to voicemail or bridging.
      </Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionButton, contactsLoading && styles.actionDisabled]}
          onPress={openContactPicker}
          disabled={contactsLoading}
        >
          <Ionicons name="people-outline" size={18} color="#e6ebf5" />
          <Text style={styles.actionText}>Import Contacts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, syncing && styles.actionDisabled]}
          onPress={syncContacts}
          disabled={syncing}
        >
          <Ionicons name="sync-outline" size={18} color="#e6ebf5" />
          <Text style={styles.actionText}>Sync</Text>
        </TouchableOpacity>
      </View>
      {contactsError ? <Text style={styles.warning}>{contactsError}</Text> : null}

      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Add caller number…"
          placeholderTextColor="#8aa0c6"
          value={input}
          onChangeText={setInput}
        />
        <TouchableOpacity style={styles.addButton} onPress={addManual}>
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
          ref={listRef}
          data={trusted}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadTrusted}
              tintColor="#8ab4ff"
              colors={['#8ab4ff']}
            />
          }
          indicatorStyle="white"
          contentContainerStyle={[
            styles.listContent,
            !loading && trusted.length === 0 && styles.listEmptyContent,
          ]}
          renderItem={({ item }) => {
            const source = (item.source ?? '').toLowerCase();
            let badgeText = 'Manual';
            if (source === 'contacts') {
              badgeText = 'Imported';
            } else if (source === 'auto') {
              badgeText = 'Auto (safe)';
            }
            return (
              <View style={styles.card}>
                <View>
                  <Text style={styles.cardText}>
                    {item.caller_number && contactNames[item.caller_number]
                      ? contactNames[item.caller_number]
                      : item.caller_number ?? 'Unknown number'}
                  </Text>
                  <Text style={styles.meta}>
                    {badgeText}
                    {item.caller_number && contactNames[item.caller_number]
                      ? ` • ${item.caller_number}`
                      : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeTrusted(item.id)}>
                  <Text style={styles.remove}>Remove</Text>
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            !activeProfile ? null : (
              <View style={styles.emptyStateWrap}>
                <EmptyState
                  icon="people-outline"
                  title="No trusted contacts"
                  body="Import contacts or add a number to let trusted callers skip the passcode."
                  ctaLabel="Add a number"
                  onPress={() => inputRef.current?.focus()}
                />
              </View>
            )
          }
        />
      )}

      {!activeProfile ? (
        <Text style={styles.warning}>Finish onboarding to add trusted contacts.</Text>
      ) : null}

      <Modal
        transparent
        animationType="slide"
        visible={pickerOpen}
        onRequestClose={closeContactPicker}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select contacts</Text>
              <TouchableOpacity onPress={closeContactPicker}>
                <Ionicons name="close" size={20} color="#e4ebf7" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalAction} onPress={selectAllContacts}>
                <Text style={styles.modalActionText}>Select all</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAction} onPress={importSelected}>
                <Text style={styles.modalActionText}>
                  Add selected ({selectedCount})
                </Text>
              </TouchableOpacity>
            </View>
            {contactsLoading ? (
              <View style={styles.modalEmpty}>
                <ActivityIndicator color="#8ab4ff" />
              </View>
            ) : (
              <FlatList
                data={contacts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => toggleContact(item.id)}
                  >
                    <Ionicons
                      name={selectedMap[item.id] ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={selectedMap[item.id] ? '#8ab4ff' : '#4f5f78'}
                    />
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName}>{item.name}</Text>
                      <Text style={styles.contactNumbers}>
                        {item.numbers.slice(0, 2).join(', ')}
                        {item.numbers.length > 2 ? '…' : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.modalEmpty}>
                    <Text style={styles.modalEmptyText}>No contacts with phone numbers found.</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
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
  subtitle: {
    color: '#8aa0c6',
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243247',
    backgroundColor: '#121a26',
  },
  actionDisabled: {
    opacity: 0.6,
  },
  actionText: {
    color: '#e6ebf5',
    fontWeight: '600',
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
    alignItems: 'center',
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
  emptyStateWrap: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  warning: {
    color: '#f7c16e',
    marginTop: 8,
  },
  listContent: {
    paddingBottom: 120,
  },
  listEmptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 10, 16, 0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0f1724',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '75%',
    borderWidth: 1,
    borderColor: '#1c2636',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#f5f7fb',
    fontSize: 18,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalAction: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243247',
    backgroundColor: '#121a26',
  },
  modalActionText: {
    color: '#e6ebf5',
    fontWeight: '600',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1b2534',
  },
  contactInfo: {
    flex: 1,
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
  modalEmpty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  modalEmptyText: {
    color: '#8aa0c6',
  },
});
