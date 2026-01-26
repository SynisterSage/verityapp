import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import SettingsHeader from '../../components/common/SettingsHeader';
import { getAllContacts, selectContacts } from '../../native/ContactPicker';
import {
  getContactsPermissionEnabled,
  subscribeToContactsPermissionChange,
} from '../../services/permissions';

type DeviceContact = {
  id: string;
  name: string;
  numbers: string[];
};

type TrustedContactRow = {
  id: string;
  caller_number: string;
  source: string;
  relationship_tag?: string | null;
  contact_name?: string | null;
  caller_hash?: string | null;
};

type ContactMapEntry = {
  name: string;
  relationship?: string;
};

const relationshipTags = [
  'Wife',
  'Husband',
  'Son',
  'Daughter',
  'Grandchild',
  'Friend',
  'Doctor',
  'Neighbor',
];

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

const contactMapKey = (profileId: string) => `trusted_contacts_map:${profileId}`;

async function readContactMap(profileId: string) {
  const raw = await AsyncStorage.getItem(contactMapKey(profileId));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, ContactMapEntry>;
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
  const [trustedList, setTrustedList] = useState<TrustedContactRow[]>([]);
  const [contactMap, setContactMap] = useState<Record<string, ContactMapEntry>>({});
  const [importing, setImporting] = useState(false);
  const [manualNumber, setManualNumber] = useState('');
  const [manualNumberDigits, setManualNumberDigits] = useState('');
  const [prevManualValue, setPrevManualValue] = useState('');
  const [error, setError] = useState('');
  const [pendingImports, setPendingImports] = useState<DeviceContact[]>([]);
  const [trayContact, setTrayContact] = useState<DeviceContact | TrustedContactRow | null>(null);
  const [trayMode, setTrayMode] = useState<'import' | 'manage' | 'manual' | null>(null);
  const [selectedTag, setSelectedTag] = useState('Friend');
  const [isTrayMounted, setIsTrayMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [contactsPermissionEnabled, setContactsAccessEnabled] = useState(true);
  const [manualContactName, setManualContactName] = useState('');
  const [manualNameEditing, setManualNameEditing] = useState(false);
  const [isSavingTag, setIsSavingTag] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const trayAnim = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0.65)).current;

  const { theme } = useTheme();
  const styles = useMemo(() => createTrustedContactsStyles(theme), [theme]);
  const placeholderColor = useMemo(
    () => withOpacity(theme.colors.textMuted, 0.65),
    [theme.colors.textMuted]
  );
  const helperItems = useMemo(
    () => [
      {
        icon: 'people-outline',
        color: theme.colors.success,
        text: 'Trusted Contacts skip the Safety PIN and connect directly.',
      },
      {
        icon: 'ban',
        color: theme.colors.danger,
        text: 'Unknown or blocked numbers are screened before they ring.',
      },
    ],
    [theme.colors.success, theme.colors.danger]
  );

  const skeletonRows = useMemo(
    () => Array.from({ length: 3 }, (_, i) => `trusted-settings-skeleton-${i}`),
    []
  );
  const showSkeleton = loading && trustedList.length === 0;
  const isImportDisabled = importing || !contactsPermissionEnabled;
  const isSyncDisabled = syncing || !contactsPermissionEnabled;

  const refreshContactMap = useCallback(async () => {
    if (!activeProfile) return;
    const map = await readContactMap(activeProfile.id);
    setContactMap(map);
  }, [activeProfile]);

  const mergeContactMapEntries = async (
    entries: { numbers: string[]; name: string; relationship?: string }[]
  ) => {
    if (!activeProfile) return;
    const map = await readContactMap(activeProfile.id);
    entries.forEach((entry) => {
      entry.numbers.forEach((number) => {
        if (!number) return;
        map[number] = {
          name: entry.name,
          relationship: entry.relationship ?? map[number]?.relationship,
        };
      });
    });
    await writeContactMap(activeProfile.id, map);
    setContactMap(map);
  };

  const loadTrustedList = useCallback(async () => {
    if (!activeProfile) {
      setLoading(false);
      return [];
    }
    setLoading(true);
    try {
      const data = await authorizedFetch(`/fraud/trusted-contacts?profileId=${activeProfile.id}`);
      const contacts = data?.trusted_contacts ?? [];
      setTrustedList(contacts);
      return contacts;
    } catch (err: any) {
      setError(err?.message || 'Failed to load trusted contacts.');
      return [];
    } finally {
      setLoading(false);
    }
  }, [activeProfile]);

  const persistRelationshipTag = async (
    profileId: string,
    number: string,
    tag: string,
    contactName?: string
  ) => {
    await authorizedFetch('/fraud/trusted-contacts', {
      method: 'PATCH',
      body: JSON.stringify({
        profileId,
        callerNumber: number,
        relationshipTag: tag,
        contactName,
      }),
    });
  };

  const showTray = () => {
    setIsTrayMounted(true);
    trayAnim.setValue(0);
    Animated.timing(trayAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const hideTray = (callback?: () => void) => {
    Animated.timing(trayAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsTrayMounted(false);
      callback?.();
    });
  };

  useEffect(() => {
    let active = true;
    getContactsPermissionEnabled().then((value) => {
      if (active) {
        setContactsAccessEnabled(value);
      }
    });
    const unsubscribe = subscribeToContactsPermissionChange((value) => {
      if (active) {
        setContactsAccessEnabled(value);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    refreshContactMap();
    loadTrustedList();
  }, [refreshContactMap, loadTrustedList]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0.65,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const upsertContactMap = async (numbers: string[], name: string, relationship?: string) => {
    if (!activeProfile) return;
    const map = await readContactMap(activeProfile.id);
    numbers.forEach((number) => {
      if (!number) return;
      map[number] = {
        name,
        relationship: relationship ?? map[number]?.relationship,
      };
    });
    await writeContactMap(activeProfile.id, map);
    setContactMap(map);
  };

  const removeFromContactMap = async (number: string) => {
    if (!activeProfile) return;
    const map = await readContactMap(activeProfile.id);
    delete map[number];
    await writeContactMap(activeProfile.id, map);
    setContactMap(map);
  };

  const handleImport = async () => {
    if (!activeProfile) return;
    if (!contactsPermissionEnabled) {
      setError('Allow contacts access in Data & Privacy before importing from your phone.');
      return;
    }
    setError('');
    setImporting(true);
    try {
      const pickedContacts = await selectContacts();
      const normalized = pickedContacts
        .map((contact) => {
          const numbers = (contact.numbers ?? [])
            .map((number) => normalizePhoneNumber(number))
            .filter(Boolean);
          const primaryNumber = numbers[0];
          if (!primaryNumber) return null;
          return {
            id: contact.id,
            name: contact.name || 'Unknown',
            numbers: [primaryNumber],
          };
        })
        .filter(Boolean) as DeviceContact[];
      if (!normalized.length) {
        setImporting(false);
        return;
      }
      const numbers = Array.from(new Set(normalized.flatMap((contact) => contact.numbers)));
      const contactNames: Record<string, string> = {};
      normalized.forEach((contact) => {
        contact.numbers.forEach((number) => {
          if (!contactNames[number]) {
            contactNames[number] = contact.name;
          }
        });
      });
      await authorizedFetch('/fraud/trusted-contacts', {
        method: 'POST',
        body: JSON.stringify({
          profileId: activeProfile.id,
          callerNumbers: numbers,
          source: 'contacts',
          contactNames,
        }),
      });
      await loadTrustedList();
      await mergeContactMapEntries(
        normalized.map((contact) => ({ numbers: contact.numbers, name: contact.name }))
      );
      startTagging(normalized);
    } catch (err: any) {
      setError(err?.message || 'Failed to import contacts.');
    } finally {
      setImporting(false);
    }
  };

  const startTagging = (contacts: DeviceContact[]) => {
    if (!contacts.length) return;
    setPendingImports(contacts);
    setTrayMode('import');
    setTrayContact(contacts[0]);
    setSelectedTag('Friend');
    showTray();
  };

  const openManageTray = (contact: TrustedContactRow) => {
    setTrayMode('manage');
    setTrayContact(contact);
    const existingTag =
      contact.relationship_tag ?? contactMap[contact.caller_number]?.relationship ?? 'Friend';
    setSelectedTag(existingTag);
    if (contact.source === 'manual') {
      setManualContactName(
        contact.contact_name ?? contactMap[contact.caller_number]?.name ?? ''
      );
      setManualNameEditing(false);
    } else {
      setManualContactName('');
      setManualNameEditing(false);
    }
    showTray();
  };

  const closeTray = () => {
    hideTray(() => {
      setTrayMode(null);
      setTrayContact(null);
      setPendingImports([]);
      setSelectedTag('Friend');
      setManualContactName('');
      setManualNameEditing(false);
    });
  };

  const handleTagSave = async () => {
    if (!trayContact || !trayMode || !activeProfile) return;
    setIsSavingTag(true);
    try {
      setError('');
      if (trayMode === 'manual') {
        const contact = trayContact as DeviceContact;
        const number = contact.numbers[0];
        const displayName = getManualContactDisplayName(number) || number;
        await authorizedFetch('/fraud/trusted-contacts', {
          method: 'POST',
          body: JSON.stringify({
            profileId: activeProfile.id,
            callerNumbers: [number],
            source: 'manual',
            contactNames: { [number]: displayName },
          }),
        });
        await persistRelationshipTag(activeProfile.id, number, selectedTag, displayName);
        await mergeContactMapEntries([{ numbers: [number], name: displayName, relationship: selectedTag }]);
        await loadTrustedList();
        closeTray();
        return;
      }
      if (trayMode === 'import') {
        const contact = trayContact as DeviceContact;
        await Promise.all(
          contact.numbers.map((number) =>
            persistRelationshipTag(activeProfile.id, number, selectedTag, contact.name)
          )
        );
        await upsertContactMap(contact.numbers, contact.name, selectedTag);
        const remaining = pendingImports.slice(1);
        setPendingImports(remaining);
        if (remaining.length === 0) {
          await loadTrustedList();
          closeTray();
        } else {
          setTrayContact(remaining[0]);
          setSelectedTag('Friend');
        }
        return;
      }
      const row = trayContact as TrustedContactRow;
      const isManualRow = row.source === 'manual';
      const displayName =
        isManualRow && manualContactName.trim().length > 0
          ? manualContactName.trim()
          : row.contact_name ?? contactMap[row.caller_number]?.name ?? row.caller_number;
      await persistRelationshipTag(
        activeProfile.id,
        row.caller_number,
        selectedTag,
        displayName
      );
      await upsertContactMap(
        [row.caller_number],
        displayName,
        selectedTag
      );
      await loadTrustedList();
      closeTray();
    } catch (err: any) {
      setError(err?.message || 'Failed to save tag.');
    } finally {
      setIsSavingTag(false);
    }
  };

  const handleRemoveContact = async () => {
    if (!trayContact || trayMode !== 'manage') return;
    setIsRemoving(true);
    const row = trayContact as TrustedContactRow;
    try {
      await authorizedFetch(`/fraud/trusted-contacts/${row.id}`, {
        method: 'DELETE',
      });
      await removeFromContactMap(row.caller_number);
      await loadTrustedList();
    } catch (err: any) {
      setError(err?.message || 'Failed to remove contact.');
    } finally {
      setIsRemoving(false);
      closeTray();
    }
  };

  const formatPhoneNumberDisplay = (digits: string) => {
    if (!digits) return '';
    const hasCountryCode = digits.length === 11 && digits.startsWith('1');
    const core = hasCountryCode ? digits.slice(1) : digits;
    const area = core.slice(0, 3);
    const prefix = core.slice(3, 6);
    const line = core.slice(6, 10);
    let formatted = '';
    if (hasCountryCode) {
      formatted += '+1 ';
    }
    if (area) {
      formatted += `(${area}`;
    }
    if (area.length === 3) {
      formatted += ') ';
    }
    if (prefix) {
      formatted += prefix;
    }
    if (line) {
      formatted += `-${line}`;
    }
    return formatted;
  };

  const getManualContactDisplayName = (number: string) => {
    if (!number) return '';
    const digits = number.replace(/\D/g, '');
    return manualContactName.trim() || formatPhoneNumberDisplay(digits) || number;
  };

  const handleManualNumberChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 11);
    setManualNumberDigits(digits);
    const formatted = formatPhoneNumberDisplay(digits);
    const isDeleting = text.length < prevManualValue.length;
    const nextValue = isDeleting ? text : formatted;
    setManualNumber(nextValue);
    setPrevManualValue(nextValue);
  };

  const addManualNumber = async () => {
    if (!manualNumberDigits || !activeProfile) return;
    const normalized = normalizePhoneNumber(manualNumberDigits);
    if (!normalized) return;
    setManualContactName('');
    setManualNameEditing(false);
    const manualContact: DeviceContact = {
      id: `manual-${normalized}`,
      name: '',
      numbers: [normalized],
    };
    setTrayMode('manual');
    setTrayContact(manualContact);
    setSelectedTag('Friend');
    showTray();
    setManualNumber('');
    setPrevManualValue('');
    setManualNumberDigits('');
  };

  const syncContacts = async () => {
    if (!activeProfile || syncing || !contactsPermissionEnabled) {
      if (!contactsPermissionEnabled) {
        setError('Enable contacts access in Data & Privacy before syncing.');
      }
      return;
    }
    setSyncing(true);
    setError('');
    try {
      const rawContacts = await getAllContacts();
      const nameMap = new Map<string, string>();
      rawContacts.forEach((contact) => {
        const normalizedNumbers = (contact.numbers ?? [])
          .map((number) => normalizePhoneNumber(number))
          .filter(Boolean);
        normalizedNumbers.forEach((number) => {
          if (!nameMap.has(number)) {
            nameMap.set(number, contact.name || 'Trusted contact');
          }
        });
      });

      const updates: Array<{ number: string; name: string }> = [];
      trustedList.forEach((entry) => {
        if (entry.source !== 'contacts') return;
        const normalized = normalizePhoneNumber(entry.caller_number ?? '');
        if (!normalized) return;
        const mappedName = nameMap.get(normalized);
        if (!mappedName) return;
        if (
          mappedName &&
          mappedName !== contactMap[normalized]?.name &&
          mappedName !== entry.contact_name
        ) {
          updates.push({ number: normalized, name: mappedName });
        }
      });

      if (updates.length > 0) {
        await Promise.all(
          updates.map((update) =>
            authorizedFetch('/fraud/trusted-contacts', {
              method: 'PATCH',
              body: JSON.stringify({
                profileId: activeProfile.id,
                callerNumber: update.number,
                contactName: update.name,
              }),
            })
          )
        );
        await mergeContactMapEntries(
          updates.map((update) => ({ numbers: [update.number], name: update.name }))
        );
      }

      await loadTrustedList();
    } catch (err: any) {
      setError(err?.message || 'Failed to sync contacts.');
    } finally {
      setSyncing(false);
    }
  };

  const getContactDisplayName = (contact: TrustedContactRow) =>
    contact.contact_name ?? contactMap[contact.caller_number]?.name ?? contact.caller_number;
  const getRelationshipLabel = (contact: TrustedContactRow) =>
    contact.relationship_tag ?? contactMap[contact.caller_number]?.relationship ?? 'Trusted Safe Contact';
  const safeList = useMemo(() => {
    const seen = new Set<string>();
    return trustedList.filter((contact) => {
      const canonical = normalizePhoneNumber(contact.caller_number);
      const key = canonical || contact.caller_hash || contact.caller_number;
      if (!key) {
        return false;
      }
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [trustedList]);
  const isManualManageContact =
    trayMode === 'manage' &&
    trayContact &&
    'source' in trayContact &&
    (trayContact as TrustedContactRow).source === 'manual';
  const manualManageRow = isManualManageContact ? (trayContact as TrustedContactRow) : null;
  const manualManageNumber = manualManageRow?.caller_number ?? '';
  const manualManageDisplayName =
    manualContactName.trim() ||
    manualManageRow?.contact_name ||
    contactMap[manualManageNumber]?.name ||
    formatPhoneNumberDisplay(manualManageNumber.replace(/\D/g, '')) ||
    manualManageNumber;

  const manualTrayNumber =
    trayMode === 'manual' && trayContact ? (trayContact as DeviceContact).numbers[0] : '';
  const manualAvatarInitial = (
    (manualContactName.trim() || manualTrayNumber.replace(/\D/g, '') || 'T')
      .charAt(0)
      .toUpperCase()
  );

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.screen} edges={[]}>
        <SettingsHeader
          title="Trusted Contacts"
          subtitle="Add friends & family you trust"
        />
        <ScrollView
          contentContainerStyle={[
            styles.body,
            {
              paddingBottom: Math.max(insets.bottom, 32) + 0,
              paddingTop: Math.max(insets.top, 12) + 0,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >

          <Pressable
            style={({ pressed }) => [
              styles.importCard,
              isImportDisabled && styles.importCardDisabled,
              !isImportDisabled && pressed && styles.importCardPressed,
            ]}
            onPress={isImportDisabled ? undefined : handleImport}
            disabled={isImportDisabled}
          >
            <View style={styles.importIcon}>
              <Ionicons name="person-add" size={24} color={theme.colors.surface} />
            </View>
            <View style={styles.importText}>
              <Text style={styles.importTitle}>Import from Phone</Text>
              <Text style={styles.importSubtitle}>Add friends &amp; family</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.accent} />
          </Pressable>
          {!contactsPermissionEnabled && (
            <Text style={styles.permissionHint}>
              Allow contact access in Data & Privacy to import & sync your phonebook.
            </Text>
          )}

          <View style={styles.syncRow}>
            <Pressable
              style={({ pressed }) => [
                styles.syncButton,
                isSyncDisabled && styles.syncButtonDisabled,
                !isSyncDisabled && pressed && styles.syncButtonPressed,
              ]}
              onPress={isSyncDisabled ? undefined : syncContacts}
              disabled={isSyncDisabled}
            >
              {syncing ? (
                <ActivityIndicator color={theme.colors.surface} />
              ) : (
                <Ionicons name="sync-outline" size={18} color={theme.colors.surface} />
              )}
              <Text style={styles.syncButtonText}>
                {syncing ? 'Syncing contacts…' : 'Sync contacts'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Manual Entry</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Phone #"
              placeholderTextColor={placeholderColor}
              value={manualNumber}
              onChangeText={handleManualNumberChange}
              keyboardType="phone-pad"
            />
            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                { opacity: pressed || !manualNumberDigits ? 0.4 : 1 },
              ]}
              onPress={addManualNumber}
              disabled={!manualNumberDigits}
            >
              <Ionicons name="add" size={20} color={theme.colors.surface} />
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionLabel}>Current Safe List</Text>

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
          ) : safeList.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="person-circle-outline" size={30} color={theme.colors.success} />
              </View>
              <Text style={styles.emptyBody}>
                Import someone from your phone or add a number from above.
              </Text>
            </View>
          ) : (
            <View style={styles.safeList}>
              {safeList.map((contact) => (
                <View key={contact.id} style={styles.listCard}>
                  <View style={styles.identity}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {getContactDisplayName(contact)?.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.identityText}>
                      <View style={styles.nameRow}>
                      <Text style={styles.personName}>{getContactDisplayName(contact)}</Text>
                        <Ionicons name="shield-checkmark" size={18} color={theme.colors.success} />
                      </View>
                      <Text style={styles.relationship}>{getRelationshipLabel(contact)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => openManageTray(contact)}>
                    <Text style={styles.manageLabel}>Manage</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.helperWrap}>
            <HowItWorksCard items={helperItems} />
          </View>
        </ScrollView>

        {isTrayMounted && trayContact && trayMode && (
          <View style={styles.trayOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeTray}>
              <Animated.View
                style={[
                  styles.trayBackdrop,
                  {
                    opacity: trayAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 0.45],
                    }),
                  },
                ]}
              />
            </Pressable>
            <Animated.View
              style={[
                styles.tray,
                {
                  transform: [
                    {
                      translateY: trayAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [220, 0],
                      }),
                    },
                  ],
                  opacity: trayAnim,
                },
              ]}
            >
              <View style={styles.trayHandle} />
              <View style={styles.trayHeader}>
                <Text style={styles.trayTitle}>
                  {trayMode === 'import' ? 'Tag Contact' : 'Manage Contact'}
                </Text>
                <Pressable onPress={closeTray}>
                  <Ionicons name="close" size={20} color={theme.colors.text} />
                </Pressable>
              </View>
              <View style={styles.trayIdentity}>
                <View style={styles.trayAvatar}>
                  <Text style={styles.trayAvatarText}>
                    {trayMode === 'import'
                      ? (trayContact as DeviceContact).name.charAt(0).toUpperCase()
                      : trayMode === 'manual'
                      ? manualAvatarInitial
                      : isManualManageContact
                      ? manualAvatarInitial
                      : getContactDisplayName(trayContact as TrustedContactRow)
                          .charAt(0)
                          .toUpperCase()}
                  </Text>
                </View>
                <View style={styles.trayIdentityText}>
                  {trayMode === 'manual' ? (
                    <>
                      <View style={styles.trayNameRow}>
                        {manualNameEditing ? (
                          <TextInput
                            value={manualContactName}
                            onChangeText={setManualContactName}
                            placeholder="Display name"
                            placeholderTextColor={placeholderColor}
                            style={styles.trayManualInput}
                            autoFocus
                          />
                        ) : (
                          <Text style={styles.trayName}>
                            {getManualContactDisplayName(manualTrayNumber)}
                          </Text>
                        )}
                        <Pressable
                          onPress={() => setManualNameEditing((prev) => !prev)}
                          style={styles.trayManualEditIcon}
                        >
                          <Ionicons name="pencil-outline" size={18} color={theme.colors.accent} />
                        </Pressable>
                      </View>
                      <Text style={styles.trayHint}>Manual trusted caller</Text>
                    </>
                  ) : isManualManageContact ? (
                    <>
                      <View style={styles.trayNameRow}>
                        {manualNameEditing ? (
                          <TextInput
                            value={manualContactName}
                            onChangeText={setManualContactName}
                            placeholder="Display name"
                            placeholderTextColor={placeholderColor}
                            style={styles.trayManualInput}
                            autoFocus
                          />
                        ) : (
                          <Text style={styles.trayName}>{manualManageDisplayName}</Text>
                        )}
                        <Pressable
                          onPress={() => setManualNameEditing((prev) => !prev)}
                          style={styles.trayManualEditIcon}
                        >
                          <Ionicons name="pencil-outline" size={18} color={theme.colors.accent} />
                        </Pressable>
                      </View>
                      <Text style={styles.trayHint}>Manual trusted caller</Text>
                    </>
                  ) : (
                    <>
                      <View style={styles.nameRow}>
                        <Text style={styles.trayName}>
                          {trayMode === 'import'
                            ? (trayContact as DeviceContact).name
                            : getContactDisplayName(trayContact as TrustedContactRow)}
                        </Text>
                        <Ionicons name="shield-checkmark" size={18} color={theme.colors.success} />
                      </View>
                      <Text style={styles.trayHint}>Trusted Safe Contact</Text>
                    </>
                  )}
                </View>
              </View>
              <Text style={styles.trayLabel}>Relationship Tag</Text>
              <View style={styles.tagGrid}>
                {relationshipTags.map((tag) => (
                  <Pressable
                    key={tag}
                    style={[
                      styles.tagPill,
                      selectedTag === tag && styles.tagPillActive,
                    ]}
                    onPress={() => setSelectedTag(tag)}
                  >
                    <Text
                      style={[
                        styles.tagText,
                        selectedTag === tag && styles.tagTextActive,
                      ]}
                    >
                      {tag}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.trayPrimary,
                  { opacity: pressed || isSavingTag ? 0.85 : 1 },
                ]}
                onPress={handleTagSave}
                disabled={isSavingTag}
              >
                <Text style={styles.trayPrimaryText}>
                  {isSavingTag
                    ? 'Working…'
                    : trayMode === 'import'
                    ? 'Add to Safe List'
                    : 'Save Changes'}
                </Text>
              </Pressable>
              {trayMode === 'manage' ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.trayDanger,
                    { opacity: pressed || isRemoving ? 0.85 : 1 },
                  ]}
                  onPress={handleRemoveContact}
                  disabled={isRemoving}
                >
                  <Text style={styles.trayDangerText}>
                    {isRemoving ? 'Working…' : 'Remove from List'}
                  </Text>
                </Pressable>
              ) : null}
            </Animated.View>
          </View>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const createTrustedContactsStyles = (theme: AppTheme) =>
  StyleSheet.create({
    outer: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    body: {
      paddingHorizontal: 32,
      paddingTop: 24,
      gap: 24,
    },
    importCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
      gap: 12,
      marginBottom: 0,
    },
    importCardDisabled: {
      borderColor: withOpacity(theme.colors.border, 0.5),
      backgroundColor: withOpacity(theme.colors.surface, 0.75),
    },
    importCardPressed: {
      opacity: 0.85,
    },
    importIcon: {
      width: 48,
      height: 48,
      borderRadius: 20,
      backgroundColor: withOpacity(theme.colors.accent, 0.16),
      alignItems: 'center',
      justifyContent: 'center',
    },
    importText: {
      flex: 1,
    },
    importTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    importSubtitle: {
      fontSize: 13,
      color: theme.colors.textMuted,
    },
    sectionLabel: {
      fontSize: 12,
      letterSpacing: 1.5,
      color: theme.colors.textMuted,
      marginBottom: 0,
      textTransform: 'uppercase',
    },
    syncRow: {
      width: '100%',
      marginBottom: 12,
      marginTop: -8,
    },
    syncButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
      width: '100%',
    },
    syncButtonPressed: {
      opacity: 0.85,
    },
    syncButtonDisabled: {
      opacity: 0.6,
    },
    syncButtonText: {
      color: theme.colors.surface,
      fontWeight: '600',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 32,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 16,
      gap: 12,
      height: 60,
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
      marginBottom: 4,
    },
    permissionHint: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginTop: -2,
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    listCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    identity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: withOpacity(theme.colors.accent, 0.16),
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: theme.colors.surface,
      fontWeight: '700',
      fontSize: 18,
    },
    identityText: {
      gap: 4,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    trayIdentityText: {
      gap: 4,
    },
    trayNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    trayManualInput: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.accent,
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
      minWidth: 120,
    },
    trayManualEditIcon: {
      padding: 4,
    },
    personName: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
    relationship: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    manageLabel: {
      color: theme.colors.accent,
      fontSize: 11,
      letterSpacing: 1,
      fontWeight: '700',
    },
    emptyCard: {
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderStyle: 'dashed',
      padding: 24,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      marginBottom: 16,
      gap: 12,
    },
    emptyIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: withOpacity(theme.colors.text, 0.06),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    emptyBody: {
      color: theme.colors.textMuted,
      fontSize: 13,
      textAlign: 'center',
    },
    skeletonWrapper: {
      marginBottom: 12,
    },
    skeletonCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 12,
    },
    safeList: {
      marginBottom: 0,
      gap: 8,
    },
    helperWrap: {
      marginTop: 0,
    },
    skeletonLine: {
      height: 10,
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.textMuted, 0.2),
      marginTop: 8,
    },
    skeletonLineShort: {
      width: '55%',
      marginTop: 4,
    },
    skeletonLineTiny: {
      width: '30%',
    },
    trayOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
    },
    trayBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.overlay,
    },
    tray: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 40,
      borderTopRightRadius: 40,
      padding: 24,
      borderColor: theme.colors.border,
      borderWidth: 1,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowOffset: { width: 0, height: -12 },
      shadowRadius: 30,
      elevation: 20,
      marginBottom: -2,
    },
    trayHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border,
      alignSelf: 'center',
      marginBottom: 16,
    },
    trayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    trayTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    trayIdentity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    trayAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: withOpacity(theme.colors.accent, 0.16),
      alignItems: 'center',
      justifyContent: 'center',
    },
    trayAvatarText: {
      color: theme.colors.surface,
      fontSize: 18,
      fontWeight: '700',
    },
    trayName: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    trayHint: {
      color: theme.colors.textMuted,
      fontSize: 13,
    },
    trayLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      letterSpacing: 1,
      marginBottom: 12,
    },
    tagGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 20,
    },
    tagPill: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tagPillActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    tagText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '600',
    },
    tagTextActive: {
      color: theme.colors.surface,
    },
    trayPrimary: {
      backgroundColor: theme.colors.accent,
      borderRadius: 20,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    trayPrimaryText: {
      color: theme.colors.surface,
      fontWeight: '700',
      fontSize: 16,
    },
    trayDanger: {
      backgroundColor: withOpacity(theme.colors.danger, 0.16),
      borderRadius: 20,
      paddingVertical: 16,
      alignItems: 'center',
    },
    trayDangerText: {
      color: theme.colors.danger,
      fontWeight: '700',
      fontSize: 16,
    },
  });
