import { useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';

export default function ChangePasscodeScreen() {
  const navigation = useNavigation();
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
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message || 'Failed to update passcode.');
    } finally {
      setIsSubmitting(false);
    }
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
        <Text style={styles.headerTitle}>Change passcode</Text>
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
        <TouchableOpacity
          style={[styles.primaryButton, isSubmitting && styles.primaryDisabled]}
          onPress={handleSave}
          disabled={isSubmitting}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Saving…' : 'Save passcode'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
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
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.08),
    },
    headerTitle: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '700',
      marginLeft: 12,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 16,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    subtitle: {
      color: theme.colors.textMuted,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.08),
      borderRadius: 12,
      padding: 12,
      color: theme.colors.text,
      letterSpacing: 2,
      backgroundColor: theme.colors.surfaceAlt,
    },
    primaryButton: {
      backgroundColor: theme.colors.accent,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
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
  });
