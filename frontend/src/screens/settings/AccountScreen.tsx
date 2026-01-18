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

import SettingsHeader from '../../components/common/SettingsHeader';
import { deleteProfile, verifyPasscode } from '../../services/profile';
import { authorizedFetch } from '../../services/backend';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import * as Clipboard from 'expo-clipboard';
import { BlurView } from 'expo-blur';

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
    label: 'Log out',
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
              paddingBottom: Math.max(insets.bottom, 32) + 12,
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
              placeholderTextColor="#6c768a"
              editable={!isReadOnly}
            />
            <Text style={styles.inputLabel}>Last name</Text>
            <TextInput
              style={[styles.input, isReadOnly && styles.inputDisabled]}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor="#6c768a"
              editable={!isReadOnly}
            />
            <Text style={styles.inputLabel}>Recipient phone</Text>
            <TextInput
              style={[styles.input, isReadOnly && styles.inputDisabled]}
              value={formattedPhone}
              onChangeText={handlePhoneChange}
              onKeyPress={handlePhoneKeyPress}
              placeholder="+1 (000) 000-0000"
              placeholderTextColor="#6c768a"
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
              <Ionicons name="calendar-outline" size={18} color="#94a3b8" />
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
              <Ionicons name={'keypad-outline' as any} size={26} color="#fff" />
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
              <Ionicons name="copy-outline" size={20} color="#94a3b8" />
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Safety controls</Text>
          <View style={styles.card}>
            {SAFETY_ACTIONS.map((action) => {
              const isWorking =
                action.key === 'logout' ? isSigningOut : action.key === 'delete' ? isPinVerifying : false;
              const disabled = action.key === 'logout' ? isSigningOut : isPinVerifying;
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
                      color={action.destructive ? '#fff' : '#2d6df6'}
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
                    <ActivityIndicator color="#94a3b8" />
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
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
                <BlurView intensity={65} tint="dark" style={styles.modalBlur} />
              </Pressable>
              <View style={styles.pinModal}>
                <Text style={styles.pinTitle}>Confirm delete</Text>
                <Text style={styles.pinSubtitle}>Enter your six-digit passcode to continue.</Text>
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

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#0b111b',
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
    color: '#98a7c2',
    fontWeight: '600',
    letterSpacing: 0.6,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 14,
    borderRadius: 16,
    backgroundColor: '#0f1724',
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
    color: '#fff',
  },
  rowDescription: {
    color: '#94a3b8',
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
    backgroundColor: '#1a2333',
  },
  iconBoxAlt: {
    backgroundColor: '#0f1724',
  },
  iconBoxDestructive: {
    backgroundColor: '#3b0d14',
  },
  manageMessage: {
    color: '#ff8a8a',
    fontSize: 12,
    marginTop: 12,
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 2,
    letterSpacing: 0.4,
  },
  input: {
    height: 60,
    borderWidth: 1,
    borderColor: '#202a3f',
    borderRadius: 24,
    paddingHorizontal: 20,
    justifyContent: 'center',
    color: '#f5f7fb',
    backgroundColor: '#0b111b',
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
    color: '#f5f7fb',
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#2d6df6',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
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
    backgroundColor: '#2a3f6a',
  },
  statusOff: {
    backgroundColor: '#1d2230',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    backgroundColor: '#121a26',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1b2534',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 6,
  },
  activeIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: '#2d6df6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeInfo: {
    flex: 1,
  },
  activeLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
    color: '#8aa0c6',
    marginBottom: 4,
  },
  activeNumber: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    flexShrink: 0,
  },
  activeStatus: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 12,
  },
  missingValue: {
    color: '#f87171',
  },
  copyButton: {
    width: 46,
    height: 46,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1b2534',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#101626',
  },
  copyButtonPressed: {
    opacity: 0.8,
  },
  copyButtonDisabled: {
    borderColor: '#111826',
    backgroundColor: '#0b111c',
  },
  destructiveText: {
    color: '#ef4444',
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
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
    backgroundColor: '#0f1724',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1b2534',
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
  pinTitle: {
    color: '#f5f7fb',
    fontSize: 20,
    fontWeight: '700',
  },
  pinSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  pinInput: {
    borderWidth: 1,
    borderColor: '#202a3e',
    borderRadius: 16,
    padding: 12,
    fontSize: 18,
    letterSpacing: 4,
    color: '#fff',
    backgroundColor: '#121a26',
    textAlign: 'center',
    width: '100%',
  },
  pinError: {
    color: '#ff8a8a',
    fontSize: 12,
  },
});
