import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';

export default function PasscodeScreen({ navigation }: { navigation: any }) {
  const { activeProfile, setActiveProfile } = useProfile();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async () => {
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
    setIsSubmitting(true);
    try {
      await authorizedFetch(`/profiles/${activeProfile.id}/passcode`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      setActiveProfile({ ...activeProfile, has_passcode: true });
      navigation.navigate('OnboardingSafePhrases');
    } catch (err: any) {
      setError(err?.message || 'Failed to save passcode.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Set a 6‑Digit Passcode</Text>
        <Text style={styles.subtitle}>
          Callers must enter this to be connected.
        </Text>

        <TextInput
          placeholder="Enter passcode"
          placeholderTextColor="#9aa3b2"
          style={styles.input}
          keyboardType="number-pad"
          value={pin}
          onChangeText={setPin}
          maxLength={6}
        />
        <TextInput
          placeholder="Confirm passcode"
          placeholderTextColor="#9aa3b2"
          style={styles.input}
          keyboardType="number-pad"
          value={confirmPin}
          onChangeText={setConfirmPin}
          maxLength={6}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.primaryButton} onPress={handleContinue} disabled={isSubmitting}>
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Saving…' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 18,
    padding: 24,
    gap: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f5f7fb',
  },
  subtitle: {
    fontSize: 14,
    color: '#b5c0d3',
  },
  input: {
    borderWidth: 1,
    borderColor: '#243247',
    borderRadius: 12,
    padding: 12,
    color: '#e6ebf5',
    letterSpacing: 2,
  },
  primaryButton: {
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
  },
});
