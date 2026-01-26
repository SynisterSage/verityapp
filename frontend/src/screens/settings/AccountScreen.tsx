import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';

import SettingsHeader from '../../components/common/SettingsHeader';
import { deleteProfile, verifyPasscode } from '../../services/profile';
import { authorizedFetch } from '../../services/backend';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import * as Clipboard from 'expo-clipboard';
import { BlurView } from 'expo-blur';
import { withOpacity } from '../../utils/color';

type PinAction = 'delete' | null;
type SafetyActionKey = 'logout' | 'delete';

const normalizePhoneDigits = (value = '') => {
  const digits = value.replace(/\D/g, '');
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
};

const formatPhoneNumber = (digits: string) => {
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6, 10);
  let formatted = '';
  if (area) {
    formatted += `(${area}`;
  }
  if (area.length === 3) {
    formatted += ') ';
  }
  if (prefix) {
    formatted += prefix;
  }
  if (prefix.length === 3) {
    formatted += '-';
  }
  if (line) {
    formatted += line;
  }
  return formatted;
};

const SAFETY_ACTIONS: Array<{
  key: SafetyActionKey;
  label: string;
  description: string;
  icon: string;
  destructive?: boolean;
}> = [
  {
    key: 'logout',
    label: 'Sign out',
    description: 'Sign out of this device.',
    icon: 'log-out-outline',
  },
  {
    key: 'delete',
    label: 'Delete account',
    description: 'Permanently remove this profile and history.',
    icon: 'trash',
    destructive: true,
  },
];

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { signOut, session } = useAuth();
  const { activeProfile, setActiveProfile, canManageProfile, refreshProfiles } = useProfile();
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createAccountStyles(theme), [theme]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [pinAction, setPinAction] = useState<PinAction>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [isPinVerifying, setIsPinVerifying] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState('');
  const lastPhoneKey = useRef<string | null>(null);

  useEffect(() => {
    if (!activeProfile) return;
    setFirstName(activeProfile.first_name ?? '');
    setLastName(activeProfile.last_name ?? '');
    setPhoneDigits(normalizePhoneDigits(activeProfile.phone_number ?? ''));
  }, [activeProfile]);

  const isReadOnly = !canManageProfile;

  const hasChanges = useMemo(() => {
    if (!activeProfile) return false;
    const existingPhoneDigits = normalizePhoneDigits(activeProfile.phone_number ?? '');
    return (
      firstName.trim() !== (activeProfile.first_name ?? '') ||
      lastName.trim() !== (activeProfile.last_name ?? '') ||
      phoneDigits !== existingPhoneDigits
    );
  }, [activeProfile, firstName, lastName, phoneDigits]);

  const formattedPhone = useMemo(
    () => (phoneDigits ? `+1 ${formatPhoneNumber(phoneDigits)}` : ''),
    [phoneDigits]
  );

  const handlePhoneChange = (value: string) => {
    const digits = normalizePhoneDigits(value);
    if (lastPhoneKey.current === 'Backspace' && digits.length === phoneDigits.length) {
      setPhoneDigits((prev) => prev.slice(0, -1));
    } else {
      setPhoneDigits(digits);
    }
    lastPhoneKey.current = null;
  };

  const handlePhoneKeyPress = ({ nativeEvent }: { nativeEvent: { key: string } }) => {
    lastPhoneKey.current = nativeEvent.key;
  };

  const profileId = activeProfile?.id;

  const fetchProfile = useCallback(async () => {
    if (!profileId) {
      return;
    }
    try {
      const data = await authorizedFetch(`/profiles/${profileId}`);
      if (data?.profile) {
        setActiveProfile(data.profile);
      }
    } catch (err) {
      console.error('Failed to refresh profile', err);
    }
  }, [profileId, setActiveProfile]);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [fetchProfile])
  );

  const saveProfile = async () => {
    if (!activeProfile) return;
    if (!canManageProfile) {
      setError('Only caretakers can update profile details.');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    setError('');
    Keyboard.dismiss();
    setIsSaving(true);
    try {
      const payloadPhone = phoneDigits ? `+1${phoneDigits}` : null;
      const data = await authorizedFetch(`/profiles/${activeProfile.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: payloadPhone,
        }),
      });
      if (data?.profile) {
        setActiveProfile(data.profile);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const runDeleteAccount = async () => {
    if (!activeProfile) return;
    setIsPinVerifying(true);
    try {
      await deleteProfile(activeProfile.id);
      await refreshProfiles();
      await signOut();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete profile.');
    } finally {
      setIsPinVerifying(false);
    }
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

  const handlePinSubmit = async () => {
    if (!pinAction || !activeProfile) return;
    if (!/^\d{6}$/.test(pinValue)) {
      setPinError('Enter your six-digit passcode.');
      return;
    }
    setIsPinVerifying(true);
    try {
      await verifyPasscode(activeProfile.id, pinValue);
      closePinModal();
      promptDeleteAccount();
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

  const closePinModal = () => {
    setPinAction(null);
    setPinValue('');
    setPinError('');
    setIsPinVerifying(false);
  };

  const handleDeletePress = () => {
    if (!canManageProfile) {
      setSafetyMessage('Only caretakers can delete this profile.');
      return;
    }
    setSafetyMessage('');
    setPinAction('delete');
  };

  const handleLogout = async () => {
    setSafetyMessage('');
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (err: any) {
      setSafetyMessage(err?.message || 'Failed to sign out.');
      setIsSigningOut(false);
    }
  };

  const emailAddress = session?.user?.email ?? '';
  const createdAt = activeProfile?.created_at
    ? new Date(activeProfile.created_at).toLocaleDateString()
    : '—';
  const twilioDigits = normalizePhoneDigits(activeProfile?.twilio_virtual_number ?? '');
  const hasTwilioNumber = Boolean(twilioDigits);
  const twilioNumber = hasTwilioNumber ? `+1${twilioDigits}` : '';
  const formattedTwilio =
    hasTwilioNumber && formatPhoneNumber(twilioDigits)
      ? `+1 ${formatPhoneNumber(twilioDigits)}`
      : 'Missing #';
  const twilioStatus = hasTwilioNumber ? 'Connected' : 'Missing';

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.screen} edges={[]}>
        <SettingsHeader title="Account" subtitle="Profile & safety" />
        <ScrollView
          contentContainerStyle={[
            styles.body,
            {
              paddingBottom: Math.max(insets.bottom, 32) + 42,
              paddingTop: Math.max(insets.top, 16),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>Profile basics</Text>
          <View style={styles.card}>
            <Text style={styles.inputLabel}>First name</Text>
            <TextInput
              style={[styles.input, isReadOnly && styles.inputDisabled]}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor={theme.colors.textDim}
              editable={!isReadOnly}
            />
            <Text style={styles.inputLabel}>Last name</Text>
            <TextInput
              style={[styles.input, isReadOnly && styles.inputDisabled]}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor={theme.colors.textDim}
              editable={!isReadOnly}
            />
            <Text style={styles.inputLabel}>Recipient phone</Text>
            <TextInput
              style={[styles.input, isReadOnly && styles.inputDisabled]}
              value={formattedPhone}
              onChangeText={handlePhoneChange}
              onKeyPress={handlePhoneKeyPress}
              placeholder="+1 (000) 000-0000"
              placeholderTextColor={theme.colors.textDim}
              keyboardType="phone-pad"
              editable={!isReadOnly}
            />
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={emailAddress || 'Not available'}
              editable={false}
            />
            <Text style={styles.inputLabel}>Account created</Text>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
              <Text style={styles.metaText}>{createdAt}</Text>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryButton, (!hasChanges || isSaving || isReadOnly) && styles.primaryDisabled]}
              onPress={saveProfile}
              disabled={!hasChanges || isSaving || isReadOnly}
            >
              <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'Update profile'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Active protection line</Text>
          <View style={styles.activeCard}>
            <View style={styles.activeIcon}>
              <Ionicons name={'keypad-outline' as any} size={26} color={theme.colors.text} />
            </View>
            <View style={styles.activeInfo}>
              <Text style={styles.activeLabel}>Verity phone number</Text>
              <Text style={[styles.activeNumber, !hasTwilioNumber && styles.missingValue]}>
                {formattedTwilio}
              </Text>
              <Text style={styles.activeStatus}>{twilioStatus}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.copyButton,
                !hasTwilioNumber && styles.copyButtonDisabled,
                pressed && hasTwilioNumber && styles.copyButtonPressed,
              ]}
              onPress={() => {
                if (!hasTwilioNumber) {
                  Alert.alert('No number available', 'Connect a Twilio number in profile settings.');
                  return;
                }
                Clipboard.setStringAsync(twilioNumber);
                Alert.alert('Copied', 'Verity number copied to clipboard.');
              }}
              disabled={!hasTwilioNumber}
            >
              <Ionicons name="copy-outline" size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Safety controls</Text>
          <View style={styles.safetyControls}>
          {SAFETY_ACTIONS.map((action) => {
            const isWorking =
              action.key === 'logout' ? isSigningOut : action.key === 'delete' ? isPinVerifying : false;
            const disabled = action.key === 'logout' ? isSigningOut : isPinVerifying;
            const iconColor = action.destructive ? theme.colors.danger : theme.colors.accent;
              return (
                <TouchableOpacity
                  key={action.key}
                  style={[
                    styles.actionRow,
                    (!disabled && isWorking) && styles.actionRowWorking,
                    disabled && styles.actionRowDisabled,
                  ]}
                  disabled={disabled}
                  onPress={() => {
                    if (action.key === 'logout') {
                      handleLogout();
                    } else {
                      handleDeletePress();
                    }
                  }}
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
                      color={iconColor}
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
                    <Text style={styles.rowDescription}>{action.description}</Text>
                  </View>
                  {isWorking ? (
                    <ActivityIndicator color={theme.colors.textMuted} />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                  )}
                </TouchableOpacity>
              );
            })}
            {safetyMessage ? <Text style={styles.manageMessage}>{safetyMessage}</Text> : null}
          </View>
        </ScrollView>
        {pinAction ? (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={closePinModal}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={styles.modalBackdrop} onPress={closePinModal}>
            <BlurView intensity={65} tint={mode === 'dark' ? 'dark' : 'light'} style={styles.modalBlur} />
              </Pressable>
              <View style={styles.pinModal}>
                <Text style={styles.pinTitle}>Confirm delete</Text>
                <Text style={styles.pinSubtitle}>Enter your six-digit passcode to continue.</Text>
                <TextInput
                  value={pinValue}
                  onChangeText={setPinValue}
                  keyboardType="number-pad"
                  placeholder="Passcode"
                  placeholderTextColor={theme.colors.textDim}
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
                    <ActivityIndicator color={theme.colors.text} />
                    ) : (
                      <Text style={[styles.modalButtonLabel, styles.modalButtonLabelPrimary]}>
                        Continue
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const createAccountStyles = (theme: AppTheme) =>
  StyleSheet.create({
    outer: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    screen: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    body: {
      paddingHorizontal: 24,
      gap: 20,
    },
    profileForm: {
      gap: 18,
    },
    sectionLabel: {
      color: theme.colors.textMuted,
      fontWeight: '600',
      letterSpacing: 0.6,
      fontSize: 12,
      textTransform: 'uppercase',
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
      gap: 12,
      elevation: 10,
    },
    safetyControls: {
      gap: 12,
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
    actionRowWorking: {
      opacity: 0.8,
    },
    actionRowDisabled: {
      opacity: 0.6,
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.text,
    },
    rowDescription: {
      color: theme.colors.textMuted,
      fontSize: 13,
      marginTop: 2,
      fontWeight: '600',
    },
    iconBox: {
      width: 48,
      height: 48,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    iconBoxAlt: {
      backgroundColor: withOpacity(theme.colors.text, 0.08),
    },
    iconBoxDestructive: {
      backgroundColor: withOpacity(theme.colors.danger, 0.15),
    },
    manageMessage: {
      color: theme.colors.danger,
      fontSize: 12,
      marginTop: 12,
    },
    inputLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      marginBottom: 2,
      letterSpacing: 0.4,
    },
    input: {
      height: 60,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 24,
      paddingHorizontal: 20,
      justifyContent: 'center',
      color: theme.colors.text,
      backgroundColor: theme.colors.surface,
    },
    inputDisabled: {
      opacity: 0.6,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    metaText: {
      color: theme.colors.text,
      fontWeight: '600',
    },
    primaryButton: {
      marginTop: 8,
      backgroundColor: theme.colors.accent,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryText: {
      color: theme.colors.surface,
      fontWeight: '700',
      fontSize: 16,
    },
    primaryDisabled: {
      opacity: 0.55,
    },
    numberRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
    },
    statusOn: {
      backgroundColor: withOpacity(theme.colors.success, 0.15),
    },
    statusOff: {
      backgroundColor: withOpacity(theme.colors.text, 0.08),
    },
    statusText: {
      color: theme.colors.surface,
      fontSize: 12,
      fontWeight: '600',
    },
    activeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 18,
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 16,
      elevation: 6,
    },
    activeIcon: {
      width: 58,
      height: 58,
      borderRadius: 20,
      backgroundColor: withOpacity(theme.colors.accent, 0.2),
      justifyContent: 'center',
      alignItems: 'center',
    },
    activeInfo: {
      flex: 1,
    },
    activeLabel: {
      fontSize: 12,
      letterSpacing: 0.4,
      color: theme.colors.textMuted,
      marginBottom: 4,
    },
    activeNumber: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
      flexShrink: 0,
    },
    activeStatus: {
      marginTop: 4,
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    missingValue: {
      color: theme.colors.danger,
    },
    copyButton: {
      width: 46,
      height: 46,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
    },
    copyButtonPressed: {
      opacity: 0.8,
    },
    copyButtonDisabled: {
      borderColor: withOpacity(theme.colors.text, 0.2),
      backgroundColor: theme.colors.surface,
    },
    destructiveText: {
      color: theme.colors.danger,
    },
    error: {
      color: theme.colors.danger,
      fontSize: 12,
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
    pinTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    pinSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 14,
      textAlign: 'center',
    },
    pinInput: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 16,
      padding: 12,
      fontSize: 18,
      letterSpacing: 4,
      color: theme.colors.text,
      backgroundColor: theme.colors.surface,
      textAlign: 'center',
      width: '100%',
    },
    pinError: {
      color: theme.colors.danger,
      fontSize: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 6,
      paddingHorizontal: 16,
      paddingVertical: 14,
      position: 'relative',
    },
    rowContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowHighlight: {
      position: 'absolute',
      top: -4,
      bottom: -4,
      left: -24,
      right: -24,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 68,
      marginVertical: 4,
    },
    signOutCard: {
      marginTop: 0,
    },
    footerText: {
      marginTop: 32,
      textAlign: 'center',
      letterSpacing: 0.3,
      fontSize: 12,
      color: withOpacity(theme.colors.text, 0.5),
    },
  });
