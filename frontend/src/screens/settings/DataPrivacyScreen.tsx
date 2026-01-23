import { useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Pressable,
} from 'react-native';
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
  verifyPasscode,
} from '../../services/profile';
import { BlurView } from 'expo-blur';

const POLICY_SECTIONS = [
  {
    title: 'Overview',
    body:
      'Verity helps you and your circle monitor calls for potential fraud. We collect only what we need to provide the service and keep it strictly secure.',
  },
  {
    title: 'What we collect',
    bullets: [
      'Account metadata (name, phone number, relationships).',
      'Call metadata (caller number, timestamps, duration).',
      'Recordings and transcripts tied to your profile.',
      'Fraud analysis signals (keywords, risk score, feedback).',
    ],
  },
  {
    title: 'How we use it',
    bullets: [
      'Power call playback, transcripts, and activity history.',
      'Detect scam patterns and highlight high-risk calls.',
      'Share alerts by email or SMS (when enabled) and improve accuracy with your feedback.',
    ],
  },
  {
    title: 'Who can access it',
    bullets: [
      'Caretaker and invited family members on the protected profile.',
      'Row-level security enforces profile-based access.',
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

function SettingRow({
  icon,
  label,
  description,
  children,
  destructive = false,
}: {
  icon: string;
  label: string;
  description: string;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.iconBox, destructive && styles.iconBoxDestructive]}>
        <Ionicons name={icon as any} size={22} color={destructive ? '#fff' : '#94a3b8'} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      {children}
    </View>
  );
}

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={[styles.toggle, value && styles.toggleActive]}>
      <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
    </Pressable>
  );
}

export default function DataPrivacyScreen() {
  const insets = useSafeAreaInsets();
  const [permissions, setPermissions] = useState(
    PERMISSIONS.reduce((acc, item) => ({ ...acc, [item.name]: true }), {} as Record<string, boolean>)
  );

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

  const togglePermission = (name: string) => {
    setPermissions((prev) => {
      const nextValue = !prev[name];
      if (name === 'Contacts') {
        setContactsPermissionEnabled(nextValue);
      }
      return { ...prev, [name]: nextValue };
    });
  };

  const { activeProfile, canManageProfile, refreshProfiles } = useProfile();
  const { signOut } = useAuth();
  const [manageAction, setManageAction] = useState<ManageActionKey | null>(null);
  const [manageError, setManageError] = useState('');
  const [pinModalAction, setPinModalAction] = useState<ManageActionKey | null>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [isPinVerifying, setIsPinVerifying] = useState(false);

  const handleExportData = async () => {
    if (!activeProfile) return;
    if (!FileSystem.documentDirectory) {
      setManageError('Unable to access file storage on this device.');
      return;
    }
    setManageAction('export');
    setManageError('');
    try {
      const payload = await exportProfileData(activeProfile.id);
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

  const handleClearRecords = async () => {
    if (!activeProfile) return;
    setManageAction('clear');
    setManageError('');
    try {
      await clearProfileRecords(activeProfile.id);
      Alert.alert('Records cleared', 'Call and alert history has been removed.');
    } catch (err: any) {
      setManageError(err?.message || 'Failed to clear records.');
    } finally {
      setManageAction(null);
    }
  };

  const runDeleteAccount = async () => {
    if (!activeProfile) return;
    setManageAction('delete');
    setManageError('');
    try {
      await deleteProfile(activeProfile.id);
      await refreshProfiles();
      await signOut();
    } catch (err: any) {
      setManageError(err?.message || 'Failed to delete profile.');
    } finally {
      setManageAction(null);
    }
  };

  const promptClearRecords = () => {
    Alert.alert(
      'Clear records?',
      'This removes call & alert history but keeps your profile intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear records', style: 'destructive', onPress: handleClearRecords },
      ]
    );
  };

  const promptDeleteAccount = () => {
    Alert.alert(
      'Delete profile?',
      'This will delete all calls, alerts, and settings for this profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Everything will be lost. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete profile',
                  style: 'destructive',
                  onPress: runDeleteAccount,
                },
              ]
            );
          },
        },
      ]
    );
  };

  const closePinModal = () => {
    setPinModalAction(null);
    setPinValue('');
    setPinError('');
  };

  const runActionAfterPin = (key: ManageActionKey) => {
    switch (key) {
      case 'export':
        handleExportData();
        break;
      case 'clear':
        promptClearRecords();
        break;
      case 'delete':
        promptDeleteAccount();
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
    setIsPinVerifying(true);
    try {
      await verifyPasscode(activeProfile.id, pinValue);
      const actionToRun = pinModalAction;
      closePinModal();
      runActionAfterPin(actionToRun);
    } catch (err: any) {
      const raw = err?.message ?? 'Passcode not recognized';
      const normalized =
        /invalid/i.test(raw) || /incorrect/i.test(raw)
          ? 'Passcode not recognized.'
          : raw;
      setPinError(normalized);
    } finally {
      setIsPinVerifying(false);
    }
  };

  const handleManageAction = (key: ManageActionKey) => {
    if (!canManageProfile) {
      setManageError('Only caretakers can manage these settings.');
      return;
    }
    setManageError('');
    setPinError('');
    setPinValue('');
    setPinModalAction(key);
  };

  const manageMessageText =
    manageError || (!canManageProfile ? 'Only caretakers can manage these settings.' : '');
  const pendingActionLabel = pinModalAction
    ? MANAGE_ACTIONS.find((item) => item.key === pinModalAction)?.label ?? ''
    : '';

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
              >
                <Toggle value={permissions[item.name]} onToggle={() => togglePermission(item.name)} />
              </SettingRow>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Policy details</Text>
          <View style={styles.policyList}>
            {POLICY_SECTIONS.map((section) => (
              <View key={section.title} style={styles.policyBlock}>
                <View style={styles.policyHeader}>
                  <View style={styles.policyIcon}>
                    <Ionicons name="information-circle-outline" size={18} color="#2d6df6" />
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
          <View style={styles.manageControls}>
            {MANAGE_ACTIONS.map((action) => {
              const isWorking = manageAction === action.key;
              const disabled = !canManageProfile || Boolean(manageAction);
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
                      color={action.destructive ? '#f87171' : '#8aa0c6'}
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
                      {action.destructive ? 'This cannot be undone' : 'Tap to manage'}
                    </Text>
                  </View>
                  {isWorking ? (
                    <ActivityIndicator color="#94a3b8" />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                  )}
                </TouchableOpacity>
              );
            })}
            {manageMessageText ? (
              <Text style={styles.manageMessage}>{manageMessageText}</Text>
            ) : null}
          </View>
          <Text style={styles.footnote}>By using Verity Protect, you acknowledge our privacy and data processing terms. {"\n"} {"\n"}  Last Updated Jan 18th, 2026</Text>
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
                <BlurView intensity={65} tint="dark" style={styles.modalBlur} />
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
                  placeholderTextColor="#6c768a"
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
                      isPinVerifying && styles.modalButtonDisabled,
                    ]}
                    onPress={handlePinSubmit}
                    disabled={isPinVerifying}
                  >
                    {isPinVerifying ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={[styles.modalButtonLabel, styles.modalButtonLabelPrimary]}>
                        Confirm
                      </Text>
                    )}
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

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  screen: {
    flex: 1,
    backgroundColor: '#0f141d',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 40,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: '#8796b0',
    marginBottom: -10,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
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
    backgroundColor: '#1a2333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxAlt: {
    backgroundColor: '#242c3d',
  },
  iconBoxDestructive: {
    backgroundColor: '#3b0d14',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#f5f7fb',
    fontSize: 17,
    fontWeight: '700',
  },
  rowDescription: {
    color: '#8aa0c6',
    fontSize: 13,
    marginTop: 2,
    fontWeight: '600',
  },
  toggle: {
    width: 51,
    height: 31,
    borderRadius: 16,
    backgroundColor: '#2f3a52',
    justifyContent: 'center',
    padding: 4,
    borderWidth: 1,
    borderColor: '#1b2534',
  },
  toggleActive: {
    backgroundColor: '#2d6df6',
    borderColor: '#2d6df6',
  },
  toggleThumb: {
    width: 23,
    height: 23,
    borderRadius: 999,
    backgroundColor: '#f5f7fb',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    transform: [{ translateX: 0 }],
  },
  toggleThumbActive: {
    transform: [{ translateX: 18 }],
  },
  policyList: {
    gap: 16,
  },
  policyBlock: {
    backgroundColor: '#0f1724',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1b2534',
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
    backgroundColor: '#1a2333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  policyTitle: {
    color: '#f5f7fb',
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  policyBody: {
    color: '#d2daea',
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
    color: '#2d6df6',
    fontSize: 16,
    lineHeight: 18,
  },
  bulletText: {
    color: '#d2daea',
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
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#121a26',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  actionRowDisabled: {
    opacity: 0.55,
  },
  actionRowWorking: {
    opacity: 0.8,
  },
  destructiveText: {
    color: '#ef4444',
  },
  manageMessage: {
    color: '#ff8a8a',
    fontSize: 12,
    marginTop: 12,
  },
  footnote: {
    color: '#7385a6',
    textAlign: 'center',
    fontSize: 12,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  pinModal: {
    backgroundColor: '#0f141d',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 24,
    width: '100%',
    maxWidth: 360,
    gap: 12,
  },
  pinTitle: {
    color: '#f5f7fb',
    fontSize: 20,
    fontWeight: '700',
  },
  pinSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
  },
  pinInput: {
    borderWidth: 1,
    borderColor: '#202a3e',
    borderRadius: 14,
    padding: 12,
    fontSize: 18,
    letterSpacing: 4,
    color: '#fff',
    backgroundColor: '#121a26',
  },
  pinError: {
    color: '#ff8a8a',
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 6,
  },
  modalButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1b2534',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#121a26',
  },
  modalButtonPrimary: {
    borderColor: '#2d6df6',
    backgroundColor: '#2d6df6',
  },
  modalButtonDisabled: {
    opacity: 0.7,
  },
  modalButtonLabel: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  modalButtonLabelPrimary: {
    color: '#fff',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalBlur: {
    ...StyleSheet.absoluteFillObject,
  },
});
