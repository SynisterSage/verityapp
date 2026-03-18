import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
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
import ReliableFallbackInfoModal from '../../components/common/ReliableFallbackInfoModal';
import VerityNumberInfoModal from '../../components/common/VerityNumberInfoModal';
import RecipientPhoneInfoModal from '../../components/common/RecipientPhoneInfoModal';
import { deleteProfile } from '../../services/profile';
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
  if (digits.length > 10 && digits.startsWith('1')) {
    return digits.slice(1, 11);
  }
  if (digits.length > 10) {
    return digits.slice(0, 10);
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
  const { signOut, session, markSignOutIntentional } = useAuth();
  const { activeProfile, setActiveProfile, canManageProfile, canDeleteProfile, refreshProfiles } = useProfile();
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createAccountStyles(theme), [theme]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [fallbackPhoneDigits, setFallbackPhoneDigits] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [pinAction, setPinAction] = useState<PinAction>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [isPinVerifying, setIsPinVerifying] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState('');
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [pendingDeletePin, setPendingDeletePin] = useState('');
  const [showFallbackInfoModal, setShowFallbackInfoModal] = useState(false);
  const [showVerityNumberInfoModal, setShowVerityNumberInfoModal] = useState(false);
  const [showRecipientPhoneInfoModal, setShowRecipientPhoneInfoModal] = useState(false);
  const [numberCopied, setNumberCopied] = useState(false);
  const lastPhoneKey = useRef<string | null>(null);
  const lastFallbackPhoneKey = useRef<string | null>(null);

  // Only reinitialize form fields when the profile ID changes (i.e., user switches
  // profiles). Using activeProfile directly would reset inputs on every background
  // refresh, reverting unsaved edits while the user is typing.
  const initializedProfileIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeProfile) return;
    if (initializedProfileIdRef.current === activeProfile.id) return;
    initializedProfileIdRef.current = activeProfile.id;
    setFirstName(activeProfile.first_name ?? '');
    setLastName(activeProfile.last_name ?? '');
    setPhoneDigits(normalizePhoneDigits(activeProfile.phone_number ?? ''));
    setFallbackPhoneDigits(normalizePhoneDigits(activeProfile.fallback_phone_number ?? ''));
  }, [activeProfile]);

  useEffect(() => {
    if (!numberCopied) return;
    const t = setTimeout(() => setNumberCopied(false), 2000);
    return () => clearTimeout(t);
  }, [numberCopied]);

  const isReadOnly = !canManageProfile;
  const safetyActions = useMemo(
    () => SAFETY_ACTIONS.filter((action) => action.key !== 'delete' || canDeleteProfile),
    [canDeleteProfile]
  );

  const hasChanges = useMemo(() => {
    if (!activeProfile) return false;
    const existingPhoneDigits = normalizePhoneDigits(activeProfile.phone_number ?? '');
    return (
      firstName.trim() !== (activeProfile.first_name ?? '') ||
      lastName.trim() !== (activeProfile.last_name ?? '') ||
      phoneDigits !== existingPhoneDigits ||
      fallbackPhoneDigits !== normalizePhoneDigits(activeProfile.fallback_phone_number ?? '')
    );
  }, [activeProfile, firstName, lastName, phoneDigits, fallbackPhoneDigits]);

  const formattedPhone = useMemo(
    () => (phoneDigits ? formatPhoneNumber(phoneDigits) : ''),
    [phoneDigits]
  );
  const formattedFallbackPhone = useMemo(
    () => (fallbackPhoneDigits ? formatPhoneNumber(fallbackPhoneDigits) : ''),
    [fallbackPhoneDigits]
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

  const handleFallbackPhoneChange = (value: string) => {
    const digits = normalizePhoneDigits(value);
    if (lastFallbackPhoneKey.current === 'Backspace' && digits.length === fallbackPhoneDigits.length) {
      setFallbackPhoneDigits((prev) => prev.slice(0, -1));
    } else {
      setFallbackPhoneDigits(digits);
    }
    lastFallbackPhoneKey.current = null;
  };

  const handleFallbackPhoneKeyPress = ({ nativeEvent }: { nativeEvent: { key: string } }) => {
    lastFallbackPhoneKey.current = nativeEvent.key;
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
      const payloadFallbackPhone = fallbackPhoneDigits ? `+1${fallbackPhoneDigits}` : null;
      const data = await authorizedFetch(`/profiles/${activeProfile.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: payloadPhone,
          fallback_phone_number: payloadFallbackPhone,
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

  const runDeleteAccount = async (pin: string) => {
    if (!activeProfile) return;
    setIsPinVerifying(true);
    try {
      markSignOutIntentional();
      await deleteProfile(activeProfile.id, pin);
      await refreshProfiles();
      await signOut();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete profile.');
    } finally {
      setIsPinVerifying(false);
    }
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
      try {
        await Linking.openURL(url);
        return;
      } catch {
        continue;
      }
    }
  };

  const handlePinSubmit = async () => {
    if (!pinAction || !activeProfile) return;
    if (!/^\d{6}$/.test(pinValue)) {
      setPinError('Enter your six-digit passcode.');
      return;
    }
    const pinToUse = pinValue;
    closePinModal();
    promptDeleteAccount(pinToUse);
  };

  const closePinModal = () => {
    setPinAction(null);
    setPinValue('');
    setPinError('');
    setIsPinVerifying(false);
  };

  const handleDeletePress = () => {
    if (!canDeleteProfile) {
      setSafetyMessage('Only the circle owner can delete this profile.');
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
    ? new Date(activeProfile.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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
            <View style={styles.inputLabelRow}>
              <Text style={styles.inputLabel}>Recipient phone</Text>
              <Pressable
                style={({ pressed }) => [styles.labelHelpButton, pressed && styles.labelHelpButtonPressed]}
                onPress={() => setShowRecipientPhoneInfoModal(true)}
                hitSlop={8}
              >
                <Ionicons name="help-circle-outline" size={16} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            <View style={[styles.inputWithPrefix, isReadOnly && styles.inputDisabled]}>
              <Text style={styles.prefixText}>+1</Text>
              <TextInput
                style={styles.inputPrefixed}
                value={formattedPhone}
                onChangeText={handlePhoneChange}
                onKeyPress={handlePhoneKeyPress}
                placeholder="(000) 000-0000"
                placeholderTextColor={theme.colors.textDim}
                keyboardType="phone-pad"
                editable={!isReadOnly}
              />
            </View>
            <View style={styles.inputLabelRow}>
              <Text style={styles.inputLabel}>Reliable fallback number (optional)</Text>
              <Pressable
                style={({ pressed }) => [styles.labelHelpButton, pressed && styles.labelHelpButtonPressed]}
                onPress={() => setShowFallbackInfoModal(true)}
                hitSlop={8}
              >
                <Ionicons name="help-circle-outline" size={16} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            <View style={[styles.inputWithPrefix, isReadOnly && styles.inputDisabled]}>
              <Text style={styles.prefixText}>+1</Text>
              <TextInput
                style={styles.inputPrefixed}
                value={formattedFallbackPhone}
                onChangeText={handleFallbackPhoneChange}
                onKeyPress={handleFallbackPhoneKeyPress}
                placeholder="(000) 000-0000"
                placeholderTextColor={theme.colors.textDim}
                keyboardType="phone-pad"
                editable={!isReadOnly}
              />
            </View>
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
              <View style={styles.activeLabelRow}>
                <Text style={styles.activeLabel}>Verity phone number</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.labelHelpButton,
                    pressed && styles.labelHelpButtonPressed,
                  ]}
                  onPress={() => setShowVerityNumberInfoModal(true)}
                  hitSlop={8}
                >
                  <Ionicons name="help-circle-outline" size={16} color={theme.colors.textMuted} />
                </Pressable>
              </View>
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
                setNumberCopied(true);
              }}
              disabled={!hasTwilioNumber}
            >
              <Ionicons
                name={numberCopied ? 'checkmark' : 'copy-outline'}
                size={20}
                color={numberCopied ? theme.colors.success : theme.colors.textMuted}
              />
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Safety controls</Text>
        <View style={styles.safetyControls}>
          {safetyActions.map((action) => {
            const isWorking =
              action.key === 'logout' ? isSigningOut : action.key === 'delete' ? isPinVerifying : false;
            const disabled =
              action.key === 'logout' ? isSigningOut : isPinVerifying;
            const iconColor = action.destructive
              ? theme.colors.danger
              : theme.colors.accent;
            const rowDescription = action.description;
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
                    <Text style={styles.rowDescription}>{rowDescription}</Text>
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
                <Text style={styles.pinTitle}>Confirm Delete account</Text>
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
        {showDeleteConfirmModal ? (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => {
              setShowDeleteConfirmModal(false);
              setPendingDeletePin('');
            }}
          >
            <View style={styles.modalOverlay}>
              <Pressable
                style={styles.modalBackdrop}
                onPress={() => {
                  setShowDeleteConfirmModal(false);
                  setPendingDeletePin('');
                }}
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
                    onPress={() => {
                      setShowDeleteConfirmModal(false);
                      setPendingDeletePin('');
                    }}
                  >
                    <Text style={styles.modalButtonLabel}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalButton, styles.deleteConfirmButton]}
                    onPress={() => {
                      const pinToDelete = pendingDeletePin;
                      setShowDeleteConfirmModal(false);
                      setPendingDeletePin('');
                      runDeleteAccount(pinToDelete);
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
        <ReliableFallbackInfoModal
          visible={showFallbackInfoModal}
          onClose={() => setShowFallbackInfoModal(false)}
          theme={theme}
          mode={mode}
        />
        <VerityNumberInfoModal
          visible={showVerityNumberInfoModal}
          onClose={() => setShowVerityNumberInfoModal(false)}
          theme={theme}
          mode={mode}
          context="settings"
        />
        <RecipientPhoneInfoModal
          visible={showRecipientPhoneInfoModal}
          onClose={() => setShowRecipientPhoneInfoModal(false)}
          theme={theme}
          mode={mode}
        />
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
    inputLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    labelHelpButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.border, 0.6),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.surface, 0.55),
    },
    labelHelpButtonPressed: {
      opacity: 0.72,
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
    inputWithPrefix: {
      height: 60,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 24,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      gap: 8,
    },
    prefixText: {
      color: theme.colors.textMuted,
      fontWeight: '600',
    },
    inputPrefixed: {
      flex: 1,
      height: '100%',
      color: theme.colors.text,
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
    activeLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 8,
      marginBottom: 4,
    },
    activeLabel: {
      fontSize: 12,
      letterSpacing: 0.4,
      color: theme.colors.textMuted,
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
    deleteModal: {
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      padding: 24,
      width: '100%',
      maxWidth: 360,
      gap: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
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
