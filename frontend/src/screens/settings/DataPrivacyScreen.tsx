import { useEffect, useMemo, useState } from 'react';
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
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';

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
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createDataPrivacyStyles(theme), [theme]);
  const policyIconColor = theme.colors.accent;
  const placeholderColor = useMemo(
    () => withOpacity(theme.colors.textMuted, 0.65),
    [theme.colors.textMuted]
  );
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
                      {action.destructive ? 'This cannot be undone' : 'Tap to manage'}
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



const createDataPrivacyStyles = (theme: AppTheme) =>
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
    policyList: {
      gap: 16,
    },
    policyBlock: {
      backgroundColor: theme.colors.surfaceAlt,
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
    footnote: {
      color: withOpacity(theme.colors.text, 0.6),
      fontSize: 11,
      marginTop: 16,
      textAlign: 'center',
    },
  });
