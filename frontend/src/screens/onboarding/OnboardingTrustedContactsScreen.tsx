import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { selectContacts } from '../../native/ContactPicker';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';

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

export default function OnboardingTrustedContactsScreen({ navigation }: { navigation: any }) {
  const { activeProfile } = useProfile();
  const { theme } = useTheme();
  const styles = useMemo(() => createTrustedContactsStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [trustedList, setTrustedList] = useState<TrustedContactRow[]>([]);
  const [contactMap, setContactMap] = useState<Record<string, ContactMapEntry>>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [pendingImports, setPendingImports] = useState<DeviceContact[]>([]);
  const [trayContact, setTrayContact] = useState<DeviceContact | TrustedContactRow | null>(null);
  const [trayMode, setTrayMode] = useState<'import' | 'manage' | null>(null);
  const [selectedTag, setSelectedTag] = useState('Friend');
  const [isTrayMounted, setIsTrayMounted] = useState(false);
  const [isSavingTag, setIsSavingTag] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const trayAnim = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0.65)).current;
  const [safeListLoading, setSafeListLoading] = useState(true);

  const helperItems = useMemo(
    () => [
      {
        icon: 'people-outline',
        color: theme.colors.success,
        text: 'Trusted Contacts can call you directly, without the Safety PIN.\nTheir calls are never screened or recorded.',
      },
      {
        icon: 'ban',
        color: theme.colors.danger,
        text: 'Calls from numbers not in Trusted Contacts, or from blocked numbers, are stopped before your phone rings.',
      },
    ],
    [theme.colors.success, theme.colors.danger]
  );

  const skeletonRows = useMemo(
    () => Array.from({ length: 3 }, (_, i) => `trusted-skeleton-${i}`),
    []
  );
  const showSkeleton = safeListLoading && trustedList.length === 0;

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
      setSafeListLoading(false);
      return [];
    }
    setSafeListLoading(true);
    try {
      const data = await authorizedFetch(`/fraud/trusted-contacts?profileId=${activeProfile.id}`);
      const contacts = data?.trusted_contacts ?? [];
      setTrustedList(contacts);
      return contacts;
    } catch (err: any) {
      setError(err?.message || 'Failed to load trusted contacts.');
      return [];
    } finally {
      setSafeListLoading(false);
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
      const numbers = Array.from(
        new Set(normalized.flatMap((contact) => contact.numbers))
      );
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
    showTray();
  };

  const closeTray = () => {
    hideTray(() => {
      setTrayMode(null);
      setTrayContact(null);
      setPendingImports([]);
      setSelectedTag('Friend');
    });
  };

  const handleTagSave = async () => {
    if (!trayContact || !trayMode || !activeProfile) return;
    setIsSavingTag(true);
    try {
      setError('');
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
      await persistRelationshipTag(
        activeProfile.id,
        row.caller_number,
        selectedTag,
        row.contact_name ?? contactMap[row.caller_number]?.name
      );
      await upsertContactMap(
        [row.caller_number],
        contactMap[row.caller_number]?.name ?? 'Trusted',
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
    const row = trayContact as TrustedContactRow;
    setIsRemoving(true);
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

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <OnboardingHeader chapter="Safe List" activeStep={5} totalSteps={9} />
        <ScrollView
          contentContainerStyle={[
            styles.body,
            {
              paddingBottom: Math.max(insets.bottom, 32) + 220,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Trusted Contacts</Text>
            <Text style={styles.subtitle}>
              People on this list skip the Safety PIN and connect to you directly.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.importCard,
              { opacity: pressed || importing ? 0.85 : 1 },
            ]}
            onPress={handleImport}
            disabled={importing}
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

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionLabel}>Current Safe List</Text>

          {showSkeleton ? (
            <View style={styles.skeletonWrapper}>
              {skeletonRows.map((key) => (
                <Animated.View
                  key={key}
                  style={[styles.skeletonCard, { opacity: shimmer }]}
                >
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
                Import someone from your phone or create an invite above.
              </Text>
            </View>
          ) : (
            safeList.map((contact) => (
              <View key={contact.id} style={styles.listCard}>
                <View style={styles.identity}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {getContactDisplayName(contact).charAt(0).toUpperCase()}
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
            ))
          )}

          <HowItWorksCard items={helperItems} />
        </ScrollView>

        <ActionFooter
          primaryLabel="Save Safe List"
          onPrimaryPress={() => navigation.navigate('OnboardingSafePhrases')}
          secondaryLabel="Skip for now"
          onSecondaryPress={() => navigation.navigate('OnboardingSafePhrases')}
        />

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
                      : getContactDisplayName(trayContact as TrustedContactRow)
                          .charAt(0)
                          .toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.trayName}>
                    {trayMode === 'import'
                      ? (trayContact as DeviceContact).name
                      : getContactDisplayName(trayContact as TrustedContactRow)}
                  </Text>
                  <Text style={styles.trayHint}>Trusted Safe Contact</Text>
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
      paddingTop: 28,
      gap: 24,
    },
    header: {
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
      maxWidth: 330,
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
      marginBottom: 24,
    },
    importIcon: {
      width: 48,
      height: 48,
      borderRadius: 20,
      backgroundColor: theme.colors.accent,
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
      marginBottom: 12,
      textTransform: 'uppercase',
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
      marginBottom: 12,
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
      backgroundColor: theme.colors.accent,
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
      borderColor: withOpacity(theme.colors.text, 0.05),
      borderStyle: 'dashed',
      padding: 24,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      marginBottom: 16,
      gap: 12,
    },
    emptyIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: withOpacity(theme.colors.success, 0.2),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text,
    },
    emptyBody: {
      color: theme.colors.textMuted,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 240,
    },
    error: {
      color: theme.colors.danger,
      marginBottom: 12,
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
    skeletonLine: {
      height: 10,
      borderRadius: 6,
      backgroundColor: withOpacity(theme.colors.text, 0.15),
      marginTop: 8,
    },
    skeletonLineShort: {
      width: '50%',
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
      backgroundColor: theme.colors.accent,
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
      backgroundColor: theme.colors.surfaceAlt,
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
      backgroundColor: theme.colors.surfaceAlt,
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
