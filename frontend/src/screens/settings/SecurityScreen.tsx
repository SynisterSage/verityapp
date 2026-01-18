import { useState } from 'react';
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

type ModalAction = 'password' | null;

export default function SecurityScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile, canManageProfile } = useProfile();
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
          { paddingBottom: Math.max(insets.bottom, 32) + 20 },
            { paddingTop: Math.max(insets.top, 12) + 0 },
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
                  placeholderTextColor="#6c768a"
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
                  placeholderTextColor="#6c768a"
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
                  placeholderTextColor="#6c768a"
                  style={[styles.input, !canManageProfile && styles.inputDisabled]}
                  editable={canManageProfile}
                />
              </View>
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryButton, (!canManageProfile || isSaving) && styles.primaryDisabled]}
              onPress={handleSavePress}
              disabled={!canManageProfile || isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Save new password</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.footerLabel}>Security managed by Verity Protect.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.googleBadge}>
              <Ionicons name="logo-google" size={28} color="#fff" />
            </View>
            <Text style={[styles.cardLabel, styles.centerText]}>Linked with Google</Text>
            <Text style={[styles.cardHelper, styles.centerText]}>
              You used Google to sign in. Your password is kept safe by Google, and you don’t need a
              separate one here.
            </Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleGoogleSettings}>
              <Text style={styles.secondaryText}>Go to Google settings</Text>
              <Ionicons name="open-outline" size={18} color="#94a3b8" />
            </TouchableOpacity>
            <Text style={styles.footerLabel}>Security managed by Verity Protect.</Text>
          </View>
        )}
      </ScrollView>

      {modalAction ? (
        <Modal visible transparent animationType="fade" onRequestClose={closeModal}>
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={closeModal}>
              <BlurView intensity={65} tint="dark" style={styles.modalBlur} />
            </Pressable>
            <View style={styles.pinModal}>
              <Text style={styles.pinTitle}>Confirm changes</Text>
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
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 4,
    gap: 20,
  },
  statusCard: {
    backgroundColor: 'transparent',
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#98a7c2',
  },
  sectionTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#f5f7fb',
    marginTop: 4,
  },
  sectionSubtitle: {
    fontSize: 18,
    color: '#94a3b8',
    marginTop: 4,
    lineHeight: 24,
    maxWidth: 320,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  cardLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f5f7fb',
  },
  cardHelper: {
    fontSize: 14,
    color: '#94a3b8',
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
    color: '#8aa0c6',
    marginBottom: 6,
  },
  input: {
    height: 60,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1b2534',
    backgroundColor: '#0b111b',
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  primaryButton: {
    marginTop: 8,
    height: 60,
    backgroundColor: '#2d6df6',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  secondaryButton: {
    marginTop: 12,
    height: 60,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1b2534',
    backgroundColor: '#0f1724',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94a3b8',
  },
  googleBadge: {
    width: 64,
    height: 64,
    borderRadius: 24,
    backgroundColor: '#2d6df6',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  footerLabel: {
    marginTop: 8,
    fontSize: 13,
    color: '#7385a6',
    textAlign: 'center',
  },
  errorText: {
    color: '#ff8a8a',
    fontSize: 13,
    marginTop: 4,
  },
  successText: {
    color: '#4ade80',
    fontSize: 13,
    marginTop: 4,
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
    borderColor: '#202a3f',
    borderRadius: 16,
    padding: 14,
    fontSize: 18,
    letterSpacing: 6,
    color: '#fff',
    backgroundColor: '#121a26',
    textAlign: 'center',
  },
  pinError: {
    color: '#ff8a8a',
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
});
