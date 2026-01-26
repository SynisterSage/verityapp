import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import SettingsHeader from '../../components/common/SettingsHeader';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { verifyPasscode } from '../../services/profile';
import { supabase } from '../../services/supabase';
import { BlurView } from 'expo-blur';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';

type ModalAction = 'password' | null;

export default function SecurityScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile, canManageProfile } = useProfile();
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createSecurityStyles(theme), [theme]);
  const placeholderColor = useMemo(
    () => withOpacity(theme.colors.textMuted, 0.65),
    [theme.colors.textMuted]
  );

  const provider = session?.user?.app_metadata?.provider ?? 'email';
  const isEmailProvider = provider === 'email';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [isPinVerifying, setIsPinVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const clearFields = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSavePress = () => {
    if (!canManageProfile) {
      setError('Only caretakers can update account security.');
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
      Alert.alert('Saved', 'Your password has been updated.');
      setSuccessMessage('Password updated.');
      clearFields();
    } catch (err: any) {
      setError(err?.message || 'Failed to update password.');
    } finally {
      setIsSaving(false);
    }
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
      setModalAction(null);
      setPinValue('');
      await runPasswordChange();
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

  const closeModal = () => {
    setModalAction(null);
    setPinValue('');
    setPinError('');
    setIsPinVerifying(false);
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

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <SettingsHeader title="Sign-in Safety" subtitle="Manage how you access Verity" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 32) + 20,
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
            <Pressable style={styles.modalBackdrop} onPress={closeModal}>
              <BlurView intensity={65} tint={mode === 'dark' ? 'dark' : 'light'} style={styles.modalBlur} />
            </Pressable>
            <View style={styles.pinModal}>
              <Text style={styles.pinTitle}>Confirm changes</Text>
              <Text style={styles.pinSubtitle}>Enter your six-digit passcode to continue.</Text>
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
                <Pressable style={styles.modalButton} onPress={closeModal}>
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
      letterSpacing: 6,
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
  });
