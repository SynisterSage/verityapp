import { useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';
import type { SettingsStackParamList } from '../../navigation/types';
import { completePinResetRequest } from '../../services/pinReset';

export default function ChangePasscodeScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<SettingsStackParamList, 'ChangePasscode'>>();
  const insets = useSafeAreaInsets();
  const { activeProfile, refreshProfiles } = useProfile();
  const { theme } = useTheme();
  const styles = useMemo(() => createChangePasscodeStyles(theme), [theme]);
  const placeholderColor = useMemo(
    () => withOpacity(theme.colors.textMuted, 0.65),
    [theme.colors.textMuted]
  );
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revealPin, setRevealPin] = useState<string | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);

  const pinResetRequestId = route.params?.pinResetRequestId;
  const requesterName = route.params?.requesterName;

  const title = pinResetRequestId ? 'Set new passcode' : 'Change passcode';

  const runBiometricGate = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      Alert.alert('Biometrics unavailable', 'Face ID or Touch ID is not available on this device.');
      return false;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm to reveal the PIN',
      fallbackLabel: 'Use device passcode',
      disableDeviceFallback: false,
    });
    if (!result.success) {
      Alert.alert('Verification failed', 'Face ID/Touch ID was not successful.');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    setError('');
    if (!/^\d{6}$/.test(pin)) {
      setError('Passcode must be 6 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('Passcodes do not match.');
      return;
    }
    if (!activeProfile) {
      setError('Profile not found.');
      return;
    }
    Keyboard.dismiss();
    setIsSubmitting(true);
    try {
      await authorizedFetch(`/profiles/${activeProfile.id}/passcode`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      await refreshProfiles();
      if (pinResetRequestId) {
        const ok = await runBiometricGate();
        if (!ok) {
          return;
        }
        setRevealPin(pin);
        setShowReveal(true);
        return;
      }
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message || 'Failed to update passcode.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyPin = async () => {
    if (!revealPin) return;
    await Clipboard.setStringAsync(revealPin);
    Alert.alert('Copied', 'PIN copied to clipboard.');
  };

  const handleSharePin = async () => {
    if (!revealPin) return;
    await Share.share({
      message: `Your new Safety PIN is ${revealPin}.`,
    });
  };

  const handleRevealDone = async () => {
    if (pinResetRequestId && activeProfile?.id) {
      setIsRevealing(true);
      try {
        await completePinResetRequest(activeProfile.id, pinResetRequestId);
      } catch {
        // best effort
      } finally {
        setIsRevealing(false);
      }
    }
    setShowReveal(false);
    setRevealPin(null);
    navigation.goBack();
  };

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.card}
      >
        <Text style={styles.subtitle}>Set a new 6-digit passcode.</Text>
        <TextInput
          placeholder="Enter passcode"
          placeholderTextColor={placeholderColor}
          style={styles.input}
          keyboardType="number-pad"
          value={pin}
          onChangeText={setPin}
          maxLength={6}
        />
        <TextInput
          placeholder="Confirm passcode"
          placeholderTextColor={placeholderColor}
          style={styles.input}
          keyboardType="number-pad"
          value={confirmPin}
          onChangeText={setConfirmPin}
          maxLength={6}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressablePressed,
            isSubmitting && styles.primaryDisabled,
          ]}
          onPress={handleSave}
          disabled={isSubmitting}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Saving…' : 'Save passcode'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>

      <Modal visible={showReveal} transparent animationType="fade">
        <View style={styles.revealOverlay}>
          <View style={styles.revealCard}>
            <Ionicons name="shield-checkmark" size={30} color={theme.colors.accent} />
            <Text style={styles.revealTitle}>New Safety PIN</Text>
            {requesterName ? (
              <Text style={styles.revealSubtitle}>Share with {requesterName}</Text>
            ) : null}
            <Text style={styles.revealPin}>{revealPin ?? '••••••'}</Text>
            <View style={styles.revealActions}>
              <Pressable
                style={({ pressed }) => [styles.revealSecondary, pressed && styles.pressablePressed]}
                onPress={handleCopyPin}
              >
                <Text style={styles.revealSecondaryText}>Copy</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.revealSecondary, pressed && styles.pressablePressed]}
                onPress={handleSharePin}
              >
                <Text style={styles.revealSecondaryText}>Share</Text>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.revealPrimary,
                pressed && styles.pressablePressed,
                isRevealing && styles.primaryDisabled,
              ]}
              onPress={handleRevealDone}
              disabled={isRevealing}
            >
              <Text style={styles.revealPrimaryText}>{isRevealing ? 'Finishing…' : 'Done'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createChangePasscodeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
      paddingHorizontal: 24,
    },
    header: {
      paddingTop: 0,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    headerTitle: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '700',
      marginLeft: 12,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
      gap: theme.spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    subtitle: {
      color: theme.colors.textMuted,
      marginBottom: 6,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.sm,
      padding: theme.spacing.sm,
      color: theme.colors.text,
      letterSpacing: 2,
      backgroundColor: theme.colors.surfaceAlt,
    },
    primaryButton: {
      backgroundColor: theme.colors.accent,
      height: theme.components.button.height,
      borderRadius: theme.components.button.radius,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.components.button.paddingHorizontal,
      marginTop: theme.spacing.xs,
    },
    primaryDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      color: theme.colors.surface,
      fontWeight: '600',
    },
    error: {
      color: theme.colors.danger,
      fontSize: 12,
    },
    revealOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.lg,
    },
    revealCard: {
      width: '100%',
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    revealTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
    },
    revealSubtitle: {
      fontSize: 13,
      color: theme.colors.textMuted,
    },
    revealPin: {
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: 6,
      color: theme.colors.text,
      marginVertical: theme.spacing.sm,
    },
    revealActions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    revealSecondary: {
      borderRadius: theme.radii.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      backgroundColor: theme.colors.surfaceAlt,
    },
    revealSecondaryText: {
      color: theme.colors.text,
      fontWeight: '600',
    },
    revealPrimary: {
      marginTop: theme.spacing.sm,
      backgroundColor: theme.colors.accent,
      height: theme.components.button.height,
      borderRadius: theme.components.button.radius,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    revealPrimaryText: {
      color: theme.colors.surface,
      fontWeight: '700',
    },
    pressablePressed: {
      opacity: 0.86,
      transform: [{ scale: 0.99 }],
    },
  });
