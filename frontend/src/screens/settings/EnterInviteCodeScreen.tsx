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
import { useNavigation } from '@react-navigation/native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';

export default function EnterInviteCodeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { refreshProfiles } = useProfile();
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const submitCode = async () => {
    if (!code.trim()) {
      setMessage('Enter the code you received.');
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
      setMessage('Invite accepted! You can now see the shared profile.');
      navigation.goBack();
    } catch (err: any) {
      setMessage(err?.message || 'Unable to accept invite.');
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Enter invite code</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Code</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          placeholder="XXXX-XXXX-XXXX"
          placeholderTextColor="#8aa0c6"
        />
        <Text style={styles.label}>Your name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          placeholderTextColor="#8aa0c6"
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last name"
          placeholderTextColor="#8aa0c6"
          autoCapitalize="words"
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.saveDisabled]}
          onPress={submitCode}
          disabled={isSubmitting}
        >
          <Text style={styles.buttonText}>{isSubmitting ? 'Saving…' : 'Redeem code'}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  back: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backText: {
    color: '#7d9dff',
  },
  title: {
    color: '#f5f7fb',
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 12,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    padding: 16,
    gap: 10,
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
    color: '#98a7c2',
    fontSize: 12,
  },
  button: {
    marginTop: 8,
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
});
