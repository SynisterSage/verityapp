import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useFocusEffect } from '@react-navigation/native';
import SettingsHeader from '../../components/common/SettingsHeader';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import type { Profile } from '../../context/ProfileContext';
import { verifyPasscode } from '../../services/profile';
import { supabase } from '../../services/supabase';
import { authorizedFetch } from '../../services/backend';
import { BlurView } from 'expo-blur';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';
import { logError, logEvent } from '../../services/sentry';
import { navigateToSupportPortal } from '../../navigation/rootNavigator';

type ModalAction = 'password' | 'pin' | null;

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Never updated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function SecurityScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile, canManageProfile, setActiveProfile } = useProfile();
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createSecurityStyles(theme), [theme]);
  const placeholderColor = useMemo(
    () => withOpacity(theme.colors.textMuted, 0.65),
    [theme.colors.textMuted]
  );
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinStep, setPinStep] = useState<'verify' | 'update'>('verify');
  const [newPinValue, setNewPinValue] = useState('');
  const [confirmNewPinValue, setConfirmNewPinValue] = useState('');
  const [changePinError, setChangePinError] = useState('');
  const [pinChangeSuccess, setPinChangeSuccess] = useState('');
  const [isPinVerifying, setIsPinVerifying] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const successAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (pinChangeSuccess) {
      successAnim.setValue(0);
      Animated.timing(successAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }).start();
    }
  }, [pinChangeSuccess, successAnim]);

  const provider = session?.user?.app_metadata?.provider ?? 'email';
  const [lastPinUpdate, setLastPinUpdate] = useState<string | null>(activeProfile?.last_pin_update ?? null);
  useEffect(() => {
    setLastPinUpdate(activeProfile?.last_pin_update ?? null);
  }, [activeProfile?.last_pin_update]);

  const fetchProfileDetails = useCallback(async () => {
    if (!activeProfile?.id) {
      return null;
    }
    const data = (await authorizedFetch(`/profiles/${activeProfile.id}`)) as {
      profile?: Profile;
    };
    return data.profile ?? null;
  }, [activeProfile?.id]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        try {
          const profile = await fetchProfileDetails();
          if (cancelled || !profile) {
            return;
          }
          setActiveProfile(profile);
          setLastPinUpdate(profile.last_pin_update ?? null);
        } catch (err) {
          console.warn('Failed to refresh PIN timestamp', err);
        }
      };
      load();
      return () => {
        cancelled = true;
      };
    }, [fetchProfileDetails, setActiveProfile])
  );
  const isEmailProvider = provider === 'email';

  const clearFields = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSavePress = () => {
    if (!canManageProfile) {
      setError('Only the owner or a caretaker can update account security.');
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setSuccessMessage('');
    setModalAction('password');
  };

  const runPasswordChange = async () => {
    if (!newPassword) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        throw error;
      }
      if (activeProfile?.id) {
        try {
          await authorizedFetch(`/profiles/${activeProfile.id}/activity`, {
            method: 'POST',
            body: JSON.stringify({
              alertType: 'security_password',
              payload: {
                message: 'Updated the account password.',
                actor_label: session?.user?.email ?? 'Circle owner',
              },
            }),
          });
        } catch (err) {
          console.warn('Failed to log password activity', err);
        }
      }
      Alert.alert('Saved', 'Your password has been updated.');
      setSuccessMessage('Password updated.');
      clearFields();
      logEvent('password_changed', { screen: 'Security' });
    } catch (err: any) {
      setError(err?.message || 'Failed to update password.');
      logError(err, {
        screen: 'Security',
        extra: { reason: err?.message || 'Failed to update password.' },
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePinPress = () => {
    if (!canManageProfile) {
      setChangePinError('Only the owner or a caretaker can update the passcode.');
      return;
    }
    setModalAction('pin');
    setPinStep('verify');
    setPinValue('');
    setPinError('');
    setNewPinValue('');
    setConfirmNewPinValue('');
    setChangePinError('');
    setPinChangeSuccess('');
  };

  const handlePinSubmit = async () => {
    if (!modalAction || !activeProfile) return;
    if (!/^\d{6}$/.test(pinValue)) {
      setPinError('Enter your six-digit passcode.');
      return;
    }
    setIsPinVerifying(true);
    try {
      await verifyPasscode(activeProfile.id, pinValue);
      setPinError('');
      if (modalAction === 'password') {
        setModalAction(null);
        setPinValue('');
        await runPasswordChange();
      } else if (modalAction === 'pin') {
        setPinStep('update');
        setPinValue('');
      }
    } catch (err: any) {
      const raw = err?.message ?? 'Passcode not recognized';
      const normalized =
        /invalid/i.test(raw) || /incorrect/i.test(raw)
          ? 'Passcode not recognized.'
          : raw;
      setPinError(normalized);
      logEvent('passcode_verification_failed', {
        level: 'warning',
        screen: 'Security',
        extra: { reason: normalized },
      });
    } finally {
      setIsPinVerifying(false);
    }
  };

  const handleSubmitNewPin = async () => {
    if (!activeProfile) return;
    if (!/^\d{6}$/.test(newPinValue)) {
      setChangePinError('Enter a six-digit passcode.');
      return;
    }
    if (newPinValue !== confirmNewPinValue) {
      setChangePinError('Passcodes must match.');
      return;
    }
    setIsChangingPin(true);
    try {
      await authorizedFetch(`/profiles/${activeProfile.id}/passcode`, {
        method: 'POST',
        body: JSON.stringify({ pin: newPinValue }),
      });
      const updatedProfile = await fetchProfileDetails();
      if (updatedProfile) {
        setActiveProfile(updatedProfile);
        setLastPinUpdate(updatedProfile.last_pin_update ?? null);
      } else {
        setLastPinUpdate(new Date().toISOString());
      }
      setPinChangeSuccess('Safety PIN updated.');
      setModalAction(null);
    } catch (err: any) {
      setChangePinError(err?.message || 'Failed to update passcode.');
    } finally {
      setIsChangingPin(false);
    }
  };

  const closeModal = () => {
    setModalAction(null);
    setPinValue('');
    setPinError('');
    setNewPinValue('');
    setConfirmNewPinValue('');
    setChangePinError('');
    setPinStep('verify');
    setIsPinVerifying(false);
    setIsChangingPin(false);
  };

  const handleGoogleSettings = async () => {
    const url = 'https://myaccount.google.com/';
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      Linking.openURL(url);
      return;
    }
    Alert.alert('Unable to open settings', 'Please visit myaccount.google.com manually.');
  };

  const handleSupportPinReset = () => {
    navigateToSupportPortal();
  };

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <SettingsHeader title="Sign-in Safety" subtitle="Manage how you access Verity" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              Math.max(insets.bottom, 32) +
              20 +
              (isEmailProvider ? 160 : 0),
            paddingTop: Math.max(insets.top, 12 + 0),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {isEmailProvider ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Update password</Text>
            <Text style={styles.cardHelper}>Enter your current password before setting a new one.</Text>
            <View style={styles.form}>
              <View>
                <Text style={styles.inputLabel}>Current password</Text>
            <TextInput
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={placeholderColor}
              style={[styles.input, !canManageProfile && styles.inputDisabled]}
              editable={canManageProfile}
            />
              </View>
              <View>
                <Text style={styles.inputLabel}>New password</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={placeholderColor}
              style={[styles.input, !canManageProfile && styles.inputDisabled]}
              editable={canManageProfile}
            />
              </View>
              <View>
                <Text style={styles.inputLabel}>Confirm new password</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={placeholderColor}
              style={[styles.input, !canManageProfile && styles.inputDisabled]}
              editable={canManageProfile}
            />
              </View>
            </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
          <Text style={styles.footerLabel}>Security managed by Verity Protect.</Text>
        </View>
      ) : (
          <View style={styles.card}>
            <View style={styles.googleBadge}>
              <Ionicons name="logo-google" size={28} color={theme.colors.surface} />
            </View>
            <Text style={[styles.cardLabel, styles.centerText]}>Linked with Google</Text>
            <Text style={[styles.cardHelper, styles.centerText]}>
              You used Google to sign in. Your password is kept safe by Google, and you don’t need a
              separate one here.
            </Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleGoogleSettings}>
              <Text style={styles.secondaryText}>Go to Google settings</Text>
              <Ionicons name="open-outline" size={18} color={theme.colors.text} />
            </TouchableOpacity>
          <Text style={styles.footerLabel}>Security managed by Verity Protect.</Text>
        </View>
      )}

      <View style={[styles.card, styles.pinCard]}>
        <View style={styles.pinHeader}>
          <Text style={styles.cardLabel}>Change Safety PIN</Text>
          <Text style={[styles.cardHelper, styles.pinHelper]}>
            Update the six-digit PIN that callers use when they are not on your trusted list.
          </Text>
        </View>
        {pinChangeSuccess ? (
          <Animated.View
            style={[styles.successBanner, styles.pinSuccessBadge, { opacity: successAnim }]}
          >
            <Text style={[styles.successText, styles.successTextBadge]}>{pinChangeSuccess}</Text>
          </Animated.View>
        ) : null}
        <TouchableOpacity
          style={[styles.secondaryButton, !canManageProfile && styles.secondaryButtonDisabled]}
          onPress={handleChangePinPress}
          disabled={!canManageProfile}
        >
          <Text style={styles.secondaryText}>Change passcode</Text>
          <Ionicons name="lock-closed-outline" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.secondaryButton,
            styles.supportResetButton,
            !canManageProfile && styles.secondaryButtonDisabled,
          ]}
          onPress={handleSupportPinReset}
          disabled={!canManageProfile}
        >
          <Text style={styles.secondaryText}>Request support reset</Text>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        {canManageProfile ? (
          <Text style={styles.cardHelper}>
            Lost PIN resets are handled by support with manual verification and take at least 1 hour.
          </Text>
        ) : (
          <Text style={styles.cardHelper}>
            Family members are read-only for PIN controls. Contact the owner or a caretaker to make
            changes.
          </Text>
        )}
        <Text style={styles.lastUpdateText}>Last updated {formatDateTime(lastPinUpdate)}</Text>
      </View>
    </ScrollView>

      {isEmailProvider ? (
        <ActionFooter
          primaryLabel="Save new password"
          onPrimaryPress={handleSavePress}
          primaryLoading={isSaving}
          primaryDisabled={
            !canManageProfile ||
            isSaving ||
            !currentPassword ||
            !newPassword ||
            !confirmPassword
          }
        />
      ) : null}

      {modalAction ? (
        <Modal visible transparent animationType="fade" onRequestClose={closeModal}>
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => {
                if (keyboardVisible) {
                  Keyboard.dismiss();
                  return;
                }
                closeModal();
              }}
            >
              <BlurView intensity={65} tint={mode === 'dark' ? 'dark' : 'light'} style={styles.modalBlur} />
            </Pressable>
            <View style={styles.pinModal}>
              <Text style={styles.pinTitle}>
                {modalAction === 'pin'
                  ? pinStep === 'verify'
                    ? 'Confirm Safety PIN'
                    : 'Set new passcode'
                  : 'Confirm changes'}
              </Text>
              <Text style={styles.pinSubtitle}>
                {modalAction === 'pin'
                  ? pinStep === 'verify'
                    ? 'Enter your current six-digit passcode.'
                    : 'Choose and confirm a new six-digit passcode.'
                  : 'Enter your six-digit passcode to continue.'}
              </Text>
              {modalAction === 'pin' && pinStep === 'update' ? (
                <>
                  <TextInput
                    value={newPinValue}
                    onChangeText={setNewPinValue}
                    keyboardType="number-pad"
                    placeholder="New passcode"
                    placeholderTextColor={placeholderColor}
                    style={styles.pinInput}
                    maxLength={6}
                    secureTextEntry
                  />
                  <TextInput
                    value={confirmNewPinValue}
                    onChangeText={setConfirmNewPinValue}
                    keyboardType="number-pad"
                    placeholder="Confirm passcode"
                    placeholderTextColor={placeholderColor}
                    style={styles.pinInput}
                    maxLength={6}
                    secureTextEntry
                  />
                  {changePinError ? <Text style={styles.pinError}>{changePinError}</Text> : null}
                </>
              ) : (
                <>
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
                </>
              )}
              <View style={styles.modalActions}>
                <Pressable style={styles.modalButton} onPress={closeModal}>
                  <Text style={styles.modalButtonLabel}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    (isPinVerifying || isChangingPin) && styles.modalButtonDisabled,
                  ]}
                  onPress={
                    modalAction === 'pin' && pinStep === 'update'
                      ? handleSubmitNewPin
                      : handlePinSubmit
                  }
                  disabled={isPinVerifying || isChangingPin}
                >
                  {modalAction === 'pin' && pinStep === 'update' ? (
                    isChangingPin ? (
                      <ActivityIndicator color={theme.colors.surface} />
                    ) : (
                      <Text style={[styles.modalButtonLabel, styles.modalButtonLabelPrimary]}>
                        Update PIN
                      </Text>
                    )
                  ) : isPinVerifying ? (
                    <ActivityIndicator color={theme.colors.surface} />
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
  );
}

const createSecurityStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 4,
      gap: 20,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 24,
      gap: 16,
      elevation: 18,
    },
    pinCard: {
      gap: 10,
      paddingBottom: 18,
    },
    cardLabel: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },
    cardHelper: {
      fontSize: 14,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    centerText: {
      textAlign: 'center',
    },
    form: {
      gap: 14,
      marginTop: 8,
    },
    inputLabel: {
      fontSize: 10,
      letterSpacing: 0.15,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
      marginBottom: 6,
    },
    input: {
      height: 60,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 16,
      color: theme.colors.text,
      fontSize: 16,
    },
    inputDisabled: {
      opacity: 0.6,
    },
    secondaryButton: {
      marginTop: 12,
      height: 60,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
    },
    secondaryButtonDisabled: {
      opacity: 0.55,
    },
    supportResetButton: {
      marginTop: 8,
    },
    secondaryText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.textMuted,
    },
    googleBadge: {
      width: 64,
      height: 64,
      borderRadius: 24,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 16,
    },
    footerLabel: {
      marginTop: 8,
      fontSize: 13,
      color: withOpacity(theme.colors.text, 0.65),
      textAlign: 'center',
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 13,
      marginTop: 4,
    },
    successText: {
      color: theme.colors.success,
      fontSize: 13,
      marginTop: 4,
    },
    successTextBadge: {
      marginTop: 0,
      textAlign: 'center',
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
      padding: 14,
      fontSize: 18,
      letterSpacing: 3,
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceAlt,
      textAlign: 'center',
    },
    pinError: {
      color: theme.colors.danger,
      fontSize: 12,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
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
    successBanner: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      backgroundColor: withOpacity(theme.colors.success, 0.12),
      borderRadius: 16,
      marginBottom: 8,
    },
    pinSuccessBadge: {
      alignSelf: 'flex-start',
    },
    pinHeader: {
      gap: 4,
    },
    pinHelper: {
      marginTop: 2,
      lineHeight: 20,
      maxWidth: '88%',
    },
    lastUpdateText: {
      fontSize: 12,
      color: theme.colors.textMuted,
      marginTop: 6,
    },
  });
