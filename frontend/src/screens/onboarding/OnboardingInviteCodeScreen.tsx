import { useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { RootStackParamList } from '../../navigation/types';

export default function OnboardingInviteCodeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'OnboardingInviteCode'>>();
  const insets = useSafeAreaInsets();
  const { refreshProfiles, setOnboardingComplete } = useProfile();
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const acceptCode = async () => {
    if (!code.trim()) {
      setMessage('Enter the invite code.');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setMessage('Add your first and last name.');
      return;
    }
    Keyboard.dismiss();
    setIsSubmitting(true);
    setMessage('');
    try {
      await authorizedFetch(`/profiles/invites/${code.trim()}/accept`, {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      await refreshProfiles();
      setOnboardingComplete(true);
    } catch (err: any) {
      setMessage(err?.message || 'Unable to redeem invite code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]} edges={[]}>
      <View style={styles.card}>
        <Text style={styles.title}>Have an invite code?</Text>
        <Text style={styles.subtitle}>Paste the code and join the shared profile instantly.</Text>
        <Text style={styles.label}>Your name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          placeholderTextColor="#9aa3b2"
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last name"
          placeholderTextColor="#9aa3b2"
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          placeholder="Invite code"
          placeholderTextColor="#9aa3b2"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={acceptCode}
          disabled={isSubmitting}
        >
          <Text style={styles.buttonText}>{isSubmitting ? 'Joining…' : 'Redeem code'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 18,
    padding: 24,
    gap: 12,
    marginTop: 40,
  },
  title: {
    color: '#f5f7fb',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#b5c0d3',
    fontSize: 14,
  },
  label: {
    color: '#8aa0c6',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#243247',
    borderRadius: 12,
    padding: 12,
    color: '#e6ebf5',
  },
  message: {
    color: '#ff8a8a',
    fontSize: 12,
  },
  button: {
    marginTop: 8,
    backgroundColor: '#2d6df6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
});
