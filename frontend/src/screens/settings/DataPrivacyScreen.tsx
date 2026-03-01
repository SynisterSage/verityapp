import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Pressable,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import SettingsHeader from '../../components/common/SettingsHeader';
import {
  getContactsPermissionEnabled,
  setContactsPermissionEnabled,
  subscribeToContactsPermissionChange,
} from '../../services/permissions';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import {
  clearProfileRecords,
  deleteProfile,
  exportProfileData,
  updateContactsPermission,
} from '../../services/profile';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';

const POLICY_SECTIONS = [
  {
    title: 'Overview',
    body:
      'Verity Protect helps you and your circle monitor calls for potential fraud. We collect only what we need to provide the service and keep it strictly secure. We never sell your data or use it for advertising.',
  },
  {
    title: 'What we collect',
    bullets: [
      'Account metadata (name, email, phone number, relationships).',
      'Call metadata (caller number, timestamps, duration, fraud scores).',
      'Call recordings and transcripts for calls routed through your Verity Protect number.',
      'Fraud analysis signals (keywords, risk patterns, feedback).',
      'Device and usage data for diagnostics and service improvement.',
    ],
  },
  {
    title: 'How we use it',
    bullets: [
      'Process and route calls to detect potential fraud in real-time.',
      'Provide call playback, transcripts, and activity history.',
      'Generate fraud risk scores and send alerts to your circle.',
      'Improve fraud detection algorithms using anonymized data.',
      'Send account notifications and security updates.',
    ],
  },
  {
    title: 'Who can access it',
    bullets: [
      'You and your authorized circle members (caretaker, family).',
      'Circle members see calls only for profiles they have permission to access.',
      'Row-level security and encryption protect all data.',
      'Trusted service providers (Twilio, Supabase, Resend) under strict contracts.',
    ],
  },
  {
    title: 'Data retention',
    body:
      'Call logs, recordings, and alerts stay available while your profile is active. You can clear records anytime, and deleting a profile removes remaining active data.',
  },
  {
    title: 'Third-party partners',
    bullets: [
      'Twilio: Powers call routing, recording, and transcription.',
      'Supabase: Secures authentication, database, and access control.',
      'Resend: Delivers account verification and alert emails.',
      'Sentry: Monitors errors and performance (no personal data).',
      'Pixabay: Notification sounds used under free commercial license.',
    ],
  },
];

type ManageActionKey = 'export' | 'clear' | 'delete';

const MANAGE_ACTIONS: Array<{
  key: ManageActionKey;
  label: string;
  icon: string;
  tint: string;
  destructive?: boolean;
  description?: string;
}> = [
  { key: 'export', label: 'Export your data', icon: 'cloud-download-outline', tint: '#2d6df6' },
  { key: 'clear', label: 'Clear records', icon: 'folder-open-outline', tint: '#7c8aff' },
  { key: 'delete', label: 'Delete account', icon: 'trash', tint: '#ef4444', destructive: true },
];

const PERMISSIONS = [
  { name: 'Contacts', description: 'Required to import Trusted Contacts', icon: 'people-outline' },
];

type SettingRowProps = {
  icon: string;
  label: string;
  description: string;
  children: React.ReactNode;
  destructive?: boolean;
  styles: ReturnType<typeof createDataPrivacyStyles>;
  theme: AppTheme;
};

function SettingRow({
  icon,
  label,
  description,
  children,
  destructive = false,
  styles,
  theme,
}: SettingRowProps) {
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.iconBox,
          destructive ? styles.iconBoxDestructive : styles.iconBoxAlt,
        ]}
      >
        <Ionicons
          name={icon as any}
          size={22}
          color={destructive ? theme.colors.surface : theme.colors.accent}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{label}</Text>
        <Text style={[styles.rowDescription, { color: theme.colors.textMuted }]}>{description}</Text>
      </View>
      {children}
    </View>
  );
}


function Toggle({
  value,
  onToggle,
  styles,
  theme,
}: {
  value: boolean;
  onToggle: () => void;
  styles: ReturnType<typeof createDataPrivacyStyles>;
  theme: AppTheme;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={[
        styles.toggle,
        value ? styles.toggleActive : {},
        {
          backgroundColor: value ? theme.colors.accent : withOpacity(theme.colors.text, 0.1),
        },
      ]}
    >
      <View
        style={[
          styles.toggleThumb,
          value ? styles.toggleThumbActive : styles.toggleThumbInactive,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      />
    </Pressable>
  );
}

type OsPermissionRowProps = {
  icon: string;
  label: string;
  description: string;
  granted: boolean | null;
  styles: ReturnType<typeof createDataPrivacyStyles>;
  theme: AppTheme;
};

function OsPermissionRow({ icon, label, description, granted, styles, theme }: OsPermissionRowProps) {
  const isGranted = granted === true;
  const statusColor = granted === null
    ? theme.colors.textMuted
    : isGranted
    ? theme.colors.success
    : theme.colors.danger;
  const statusLabel = granted === null ? '—' : isGranted ? 'Allowed' : 'Denied';

  return (
    <View style={[styles.row, styles.rowBorder]}>
      <View style={[styles.iconBox, styles.iconBoxAlt]}>
        <Ionicons name={icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={theme.colors.accent} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{label}</Text>
        <Text style={[styles.rowDescription, { color: theme.colors.textMuted }]}>{description}</Text>
      </View>
      <TouchableOpacity
        onPress={() => Linking.openSettings()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={[styles.osPermBadge, { backgroundColor: withOpacity(statusColor, 0.1) }]}>
          <View style={[styles.osPermDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.osPermLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

export default function DataPrivacyScreen() {
  const insets = useSafeAreaInsets();
  const [permissions, setPermissions] = useState(
    PERMISSIONS.reduce((acc, item) => ({ ...acc, [item.name]: true }), {} as Record<string, boolean>)
  );

  // OS-level permission status (read-only — user must go to iOS Settings to change)
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [micGranted, setMicGranted] = useState<boolean | null>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotifGranted(status === 'granted');
    }).catch(() => setNotifGranted(false));
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      setLocationGranted(status === 'granted');
    }).catch(() => setLocationGranted(false));
    Audio.getPermissionsAsync().then(({ status }) => {
      setMicGranted(status === 'granted');
    }).catch(() => setMicGranted(false));
  }, []);

  useEffect(() => {
    let mounted = true;
    getContactsPermissionEnabled().then((value) => {
      if (!mounted) return;
      setPermissions((prev) => ({ ...prev, Contacts: value }));
    });
    const unsubscribe = subscribeToContactsPermissionChange((value) => {
      if (!mounted) return;
      setPermissions((prev) => ({ ...prev, Contacts: value }));
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const togglePermission = async (name: string) => {
    const nextValue = !permissions[name];
    setPermissions((prev) => ({ ...prev, [name]: nextValue }));

    if (name !== 'Contacts') {
      return;
    }

    await setContactsPermissionEnabled(nextValue);
    if (nextValue || !activeProfile?.id) {
      return;
    }

    try {
      await AsyncStorage.removeItem(`trusted_contacts_map:${activeProfile.id}`);
    } catch (error) {
      console.warn('Failed to clear local contact map', error);
    }

    if (!canManageProfile) {
      return;
    }

    try {
      await updateContactsPermission(activeProfile.id, false);
    } catch (err: any) {
      setManageError(err?.message || 'Failed to remove stored contact names.');
    }
  };

  const { activeProfile, canManageProfile, canDeleteProfile, refreshProfiles } = useProfile();
  const { signOut } = useAuth();
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createDataPrivacyStyles(theme, mode), [theme, mode]);
  const policyIconColor = theme.colors.accent;
  const placeholderColor = useMemo(
    () => withOpacity(theme.colors.textMuted, 0.65),
    [theme.colors.textMuted]
  );
  const [manageAction, setManageAction] = useState<ManageActionKey | null>(null);
  const [manageError, setManageError] = useState('');
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [pendingDeletePin, setPendingDeletePin] = useState('');
  const [pinModalAction, setPinModalAction] = useState<ManageActionKey | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');

  const handleExportData = async (pin: string) => {
    if (!activeProfile) return;
    if (!FileSystem.documentDirectory) {
      setManageError('Unable to access file storage on this device.');
      return;
    }
    setManageAction('export');
    setManageError('');
    try {
      const payload = await exportProfileData(activeProfile.id, pin);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `verity-data-export-${timestamp}.json`;
      const uri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      let message = `Saved to Files as ${filename}.`;
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/json',
            dialogTitle: 'Export SafeCall data',
          });
          message = 'Export saved and ready to share.';
        }
      } catch (shareError: any) {
        console.warn('Sharing export failed', shareError);
        message = `Saved to Files as ${filename}.`;
      }
      Alert.alert('Export saved', message);
    } catch (err: any) {
      setManageError(err?.message || 'Failed to export data.');
    } finally {
      setManageAction(null);
    }
  };

  const handleClearRecords = async (pin: string) => {
    if (!activeProfile) return;
    setManageAction('clear');
    setManageError('');
    try {
      await clearProfileRecords(activeProfile.id, pin);
      Alert.alert('Records cleared', 'Call and alert history has been removed.');
    } catch (err: any) {
      setManageError(err?.message || 'Failed to clear records.');
    } finally {
      setManageAction(null);
    }
  };

  const runDeleteAccount = async (pin: string) => {
    if (!activeProfile) return;
    setManageAction('delete');
    setManageError('');
    try {
      await deleteProfile(activeProfile.id, pin);
      await refreshProfiles();
      await signOut();
    } catch (err: any) {
      setManageError(err?.message || 'Failed to delete profile.');
    } finally {
      setManageAction(null);
    }
  };

  const promptClearRecords = (pin: string) => {
    Alert.alert(
      'Clear records?',
      'This removes call & alert history but keeps your profile intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear records', style: 'destructive', onPress: () => handleClearRecords(pin) },
      ]
    );
  };

  const promptDeleteAccount = (pin: string) => {
    setPendingDeletePin(pin);
    setShowDeleteConfirmModal(true);
  };

  const handleManageSubscription = async () => {
    const targets = [
      'itms-apps://apps.apple.com/account/subscriptions',
      'https://apps.apple.com/account/subscriptions',
    ];
    for (const url of targets) {
      try { await Linking.openURL(url); return; } catch { continue; }
    }
  };

  const closePinModal = () => {
    setPinModalAction(null);
    setPinValue('');
    setPinError('');
  };

  const runActionAfterPin = (key: ManageActionKey, pin: string) => {
    switch (key) {
      case 'export':
        handleExportData(pin);
        break;
      case 'clear':
        promptClearRecords(pin);
        break;
      case 'delete':
        promptDeleteAccount(pin);
        break;
    }
  };

  const handlePinSubmit = async () => {
    if (!pinModalAction || !activeProfile) {
      return;
    }
    if (!/^\d{6}$/.test(pinValue)) {
      setPinError('Enter your 6-digit passcode.');
      return;
    }
    const actionToRun = pinModalAction;
    const pinToUse = pinValue;
    closePinModal();
    runActionAfterPin(actionToRun, pinToUse);
  };

  const handleManageAction = (key: ManageActionKey) => {
    if (!canManageProfile) {
      setManageError('');
      return;
    }
    if (key === 'delete' && !canDeleteProfile) {
      setManageError('');
      return;
    }
    setManageError('');
    setPinError('');
    setPinValue('');
    setPinModalAction(key);
  };

  const manageMessageText = manageError;
  const pendingActionLabel = pinModalAction
    ? MANAGE_ACTIONS.find((item) => item.key === pinModalAction)?.label ?? ''
    : '';
  const [linkError, setLinkError] = useState('');

  const handleOpenUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (err: any) {
      setLinkError('Unable to open link right now.');
    }
  };

  return (
    <View style={styles.outer}>
      <SafeAreaView style={styles.screen} edges={[]}>
        <SettingsHeader title="Data & Privacy" subtitle="Your protection and privacy come first." />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 32) + 20 },
            { paddingTop: Math.max(insets.top, 12) + 0 },

          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>System permissions</Text>
          <View style={styles.card}>
            {PERMISSIONS.map((item) => (
              <SettingRow
                key={item.name}
                icon={item.icon}
                label={item.name}
                description={item.description}
                styles={styles}
                theme={theme}
              >
                <Toggle
                  value={permissions[item.name]}
                  onToggle={() => togglePermission(item.name)}
                  styles={styles}
                  theme={theme}
                />
              </SettingRow>
            ))}
            <OsPermissionRow
              icon="notifications-outline"
              label="Notifications"
              description="Required to receive call alerts and circle updates"
              granted={notifGranted}
              styles={styles}
              theme={theme}
            />
            <OsPermissionRow
              icon="location-outline"
              label="Location"
              description="Used to find nearby care providers in Doctor Lookup"
              granted={locationGranted}
              styles={styles}
              theme={theme}
            />
            <OsPermissionRow
              icon="mic-outline"
              label="Microphone"
              description="Used to screen and connect incoming calls"
              granted={micGranted}
              styles={styles}
              theme={theme}
            />
          </View>

          <Text style={styles.sectionLabel}>Policy details</Text>
          <View style={styles.policyList}>
            {POLICY_SECTIONS.map((section) => (
              <View key={section.title} style={styles.policyBlock}>
                <View style={styles.policyHeader}>
                  <View style={styles.policyIcon}>
                <Ionicons name="information-circle-outline" size={18} color={policyIconColor} />
                  </View>
                  <Text style={styles.policyTitle}>{section.title}</Text>
                </View>
                {section.body ? <Text style={styles.policyBody}>{section.body}</Text> : null}
                {section.bullets
                  ? section.bullets.map((item) => (
                      <View key={item} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>{item}</Text>
                      </View>
                    ))
                  : null}
              </View>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Manage data</Text>
          {!canManageProfile ? (
            <Text style={[styles.manageMessage, styles.manageMessageInline]}>
              Only caretakers or admins can manage these settings.
            </Text>
          ) : null}
          <View style={styles.manageControls}>
            {MANAGE_ACTIONS.map((action) => {
              const isWorking = manageAction === action.key;
              const isDeleteAction = action.key === 'delete';
              const disabled =
                !canManageProfile || Boolean(manageAction) || (isDeleteAction && !canDeleteProfile);
              return (
                <TouchableOpacity
                  key={action.key}
                  style={[
                    styles.actionRow,
                    !disabled && isWorking && styles.actionRowWorking,
                    disabled && styles.actionRowDisabled,
                  ]}
                  disabled={disabled}
                  onPress={() => handleManageAction(action.key)}
                >
                  <View
                    style={[
                      styles.iconBox,
                      action.destructive ? styles.iconBoxDestructive : styles.iconBoxAlt,
                    ]}
                  >
                    <Ionicons
                      name={action.icon as any}
                      size={22}
                      color={action.destructive ? theme.colors.danger : theme.colors.accent}
                    />
                  </View>
                  <View style={styles.rowText}>
                    <Text
                      style={[
                        styles.rowTitle,
                        action.destructive && styles.destructiveText,
                      ]}
                    >
                      {isWorking ? 'Working…' : action.label}
                    </Text>
                    <Text style={styles.rowDescription}>
                      {isDeleteAction && !canDeleteProfile
                        ? 'Only the circle owner can delete the account.'
                        : action.destructive
                          ? 'This cannot be undone'
                          : 'Tap to manage'}
                    </Text>
                  </View>
                  {isWorking ? (
                    <ActivityIndicator color={theme.colors.text} />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                  )}
                </TouchableOpacity>
              );
            })}
            {manageMessageText ? (
              <Text style={styles.manageMessage}>{manageMessageText}</Text>
            ) : null}
          </View>
          <View style={styles.contactCard}>
            <Text style={styles.contactTitle}>Need help with your data?</Text>
            <Text style={styles.contactBody}>
              Reach out to support@verityprotect.com to export, correct, or delete anything we store for you.
            </Text>
            <View style={styles.contactActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.legalButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => handleOpenUrl('https://verityprotect.com/privacy')}
              >
                <Text style={styles.legalButtonText}>Privacy policy</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.legalButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => handleOpenUrl('https://verityprotect.com/terms')}
              >
                <Text style={styles.legalButtonText}>Terms of service</Text>
              </Pressable>
            </View>
            {linkError ? <Text style={[styles.manageMessage]}>{linkError}</Text> : null}
          </View>
          <Text style={styles.footnote}>By using Verity Protect, you acknowledge our privacy and data processing terms. {"\n"} {"\n"}  Last Updated Feb 20th, 2026</Text>
        </ScrollView>
        {pinModalAction ? (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={closePinModal}
          >
            <View style={styles.modalOverlay}>
                <Pressable style={styles.modalBackdrop} onPress={closePinModal}>
                  <BlurView
                    intensity={65}
                    tint={mode === 'dark' ? 'dark' : 'light'}
                    style={styles.modalBlur}
                  />
                </Pressable>
              <View style={styles.pinModal}>
                <Text style={styles.pinTitle}>Confirm {pendingActionLabel}</Text>
                <Text style={styles.pinSubtitle}>
                  Enter your six-digit passcode to continue.
                </Text>
                <TextInput
                  value={pinValue}
                  onChangeText={setPinValue}
                  keyboardType="number-pad"
                  placeholder="Passcode"
                  placeholderTextColor={placeholderColor}
                  style={styles.pinInput}
                  maxLength={6}
                  secureTextEntry
                />
                {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalButton} onPress={closePinModal}>
                    <Text style={styles.modalButtonLabel}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.modalButton,
                      styles.modalButtonPrimary,
                    ]}
                    onPress={handlePinSubmit}
                  >
                    <Text style={[styles.modalButtonLabel, styles.modalButtonLabelPrimary]}>
                      Confirm
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        ) : null}

        {showDeleteConfirmModal ? (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => setShowDeleteConfirmModal(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable
                style={styles.modalBackdrop}
                onPress={() => setShowDeleteConfirmModal(false)}
              >
                <BlurView
                  intensity={65}
                  tint={mode === 'dark' ? 'dark' : 'light'}
                  style={styles.modalBlur}
                />
              </Pressable>
              <View style={styles.deleteModal}>
                <View style={styles.deleteIconWrap}>
                  <Ionicons name="trash-outline" size={26} color={theme.colors.danger} />
                </View>
                <Text style={styles.deleteTitle}>Delete your account?</Text>
                <Text style={styles.deleteBody}>
                  This permanently removes your account, all calls, alerts, and settings. This cannot be undone.
                </Text>
                <View style={styles.deleteWarningCard}>
                  <Ionicons name="warning-outline" size={16} color={theme.colors.warning} style={{ marginTop: 1 }} />
                  <Text style={styles.deleteWarningText}>
                    Your Verity membership will{' '}
                    <Text style={styles.deleteWarningBold}>keep billing through Apple</Text>
                    {' '}even after deletion. Cancel your subscription first.
                  </Text>
                </View>
                <Pressable
                  style={styles.manageSubButton}
                  onPress={handleManageSubscription}
                >
                  <Ionicons name="card-outline" size={15} color={theme.colors.accent} />
                  <Text style={styles.manageSubButtonText}>Manage subscription in App Store</Text>
                  <Ionicons name="open-outline" size={13} color={theme.colors.textMuted} />
                </Pressable>
                <View style={styles.deleteActions}>
                  <Pressable
                    style={styles.modalButton}
                    onPress={() => setShowDeleteConfirmModal(false)}
                  >
                    <Text style={styles.modalButtonLabel}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalButton, styles.deleteConfirmButton]}
                    onPress={() => {
                      setShowDeleteConfirmModal(false);
                      runDeleteAccount(pendingDeletePin);
                    }}
                  >
                    <Text style={[styles.modalButtonLabel, styles.deleteConfirmButtonLabel]}>
                      Delete account
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
      </SafeAreaView>
    </View>
  );
}



const createDataPrivacyStyles = (theme: AppTheme, mode: 'light' | 'dark') =>
  StyleSheet.create({
    outer: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    screen: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 40,
      gap: 20,
    },
    sectionLabel: {
      fontSize: 12,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
      marginBottom: 0,
      paddingTop: 4,
    },
    card: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 20,
      gap: 18,
    },
    manageControls: {
      gap: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingVertical: 6,
    },
    iconBox: {
      width: 48,
      height: 48,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBoxAlt: {
      backgroundColor: withOpacity(theme.colors.text, 0.05),
    },
    iconBoxDestructive: {
      borderWidth: 0,
      borderColor: theme.colors.danger,
      backgroundColor: withOpacity(theme.colors.danger, 0.16),
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: '700',
    },
    rowDescription: {
      color: theme.colors.textMuted,
      fontSize: 13,
      marginTop: 2,
      fontWeight: '600',
    },
    toggle: {
      width: 51,
      height: 31,
      borderRadius: 16,
      justifyContent: 'center',
      padding: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
    },
    toggleActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    toggleThumb: {
      width: 23,
      height: 23,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
    },
    toggleThumbActive: {
      transform: [{ translateX: 18 }],
    },
    toggleThumbInactive: {
      transform: [{ translateX: 0 }],
    },
    rowBorder: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: 12,
      marginTop: 4,
    },
    osPermBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
    },
    osPermDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    osPermLabel: {
      fontSize: 12,
      fontWeight: '700',
    },
    policyList: {
      gap: 16,
    },
    policyBlock: {
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      gap: 10,
    },
    policyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    policyIcon: {
      width: 32,
      height: 32,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    policyTitle: {
      color: theme.colors.text,
      fontSize: 12,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    policyBody: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '500',
      lineHeight: 22,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 4,
    },
    bulletDot: {
      color: theme.colors.accent,
      fontSize: 16,
      lineHeight: 18,
    },
    bulletText: {
      color: theme.colors.text,
      flex: 1,
      lineHeight: 20,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 64,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 14,
      borderRadius: 28,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      elevation: 10,
    },
    actionRowDisabled: {
      opacity: 0.55,
    },
    actionRowWorking: {
      opacity: 0.8,
    },
    destructiveText: {
      color: theme.colors.danger,
    },
    manageMessage: {
      color: theme.colors.danger,
      fontSize: 12,
      marginTop: 12,
    },
    manageMessageInline: {
      marginTop: 4,
      marginBottom: 4,
    },
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withOpacity(theme.colors.text, 0.45),
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    modalBlur: {
      ...StyleSheet.absoluteFillObject,
    },
    pinModal: {
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 24,
      width: '100%',
      maxWidth: 360,
      gap: 12,
    },
    pinTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    pinSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
    },
    pinInput: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      padding: 12,
      fontSize: 18,
      letterSpacing: 6,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceAlt,
    },
    pinError: {
      color: theme.colors.danger,
      fontSize: 12,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 12,
    },
    modalButton: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
    },
    modalButtonPrimary: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accent,
    },
    modalButtonDisabled: {
      opacity: 0.7,
    },
    modalButtonLabel: {
      color: theme.colors.textMuted,
      fontWeight: '600',
    },
    modalButtonLabelPrimary: {
      color: theme.colors.surface,
    },
    deleteModal: {
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      padding: 24,
      width: '100%',
      maxWidth: 360,
      gap: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: mode === 'dark' ? 0.4 : 0.12,
      shadowRadius: 16,
      elevation: 8,
    },
    deleteIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: withOpacity(theme.colors.danger, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    deleteBody: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    deleteWarningCard: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: 14,
      padding: 14,
      alignItems: 'flex-start',
    },
    deleteWarningText: {
      flex: 1,
      fontSize: 13,
      color: theme.colors.textMuted,
      lineHeight: 18,
    },
    deleteWarningBold: {
      fontWeight: '700',
      color: theme.colors.text,
    },
    manageSubButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    manageSubButtonText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.accent,
    },
    deleteActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 2,
    },
    deleteConfirmButton: {
      borderColor: withOpacity(theme.colors.danger, 0.4),
      backgroundColor: withOpacity(theme.colors.danger, 0.1),
    },
    deleteConfirmButtonLabel: {
      color: theme.colors.danger,
    },
    contactCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 20,
      gap: 10,
    },
    contactTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    contactBody: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    contactActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    legalButton: {
      flex: 1,
      borderRadius: 18,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.2),
      backgroundColor: withOpacity(theme.colors.accent, 0.08),
      alignItems: 'center',
    },
    legalButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.accent,
      letterSpacing: 0.2,
    },
    footnote: {
      color: withOpacity(theme.colors.text, 0.6),
      fontSize: 11,
      marginTop: 16,
      textAlign: 'center',
    },
  });
