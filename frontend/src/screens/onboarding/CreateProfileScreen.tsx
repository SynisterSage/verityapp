import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';

export default function CreateProfileScreen({ navigation }: { navigation: any }) {
  const { activeProfile, setActiveProfile, setOnboardingComplete } = useProfile();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+1');
  const [twilioNumber, setTwilioNumber] = useState('+1');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async () => {
    if (activeProfile) {
      navigation.navigate('OnboardingPasscode');
      return;
    }
    setError('');
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: phoneNumber.trim() || null,
        twilio_virtual_number: twilioNumber.trim() || null,
      };
      const data = await authorizedFetch('/profiles', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data?.profile) {
        setActiveProfile(data.profile);
        setOnboardingComplete(false);
        navigation.navigate('OnboardingPasscode');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to create profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (activeProfile) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Profile Already Created</Text>
          <Text style={styles.subtitle}>
            Continue onboarding for {activeProfile.first_name} {activeProfile.last_name}.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Create Elder Profile</Text>
        <Text style={styles.subtitle}>Set up the person you’re protecting.</Text>

        <TextInput
          placeholder="First name"
          placeholderTextColor="#9aa3b2"
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
        />
        <TextInput
          placeholder="Last name"
          placeholderTextColor="#9aa3b2"
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
        />
        <TextInput
          placeholder="Phone number (optional)"
          placeholderTextColor="#9aa3b2"
          style={styles.input}
          keyboardType="phone-pad"
          value={phoneNumber}
          onChangeText={(value) => {
            if (!value.startsWith('+1')) {
              setPhoneNumber(`+1${value.replace(/^\+?1?/, '')}`);
              return;
            }
            setPhoneNumber(value);
          }}
        />
        <TextInput
          placeholder="Twilio number (optional for now)"
          placeholderTextColor="#9aa3b2"
          style={styles.input}
          keyboardType="phone-pad"
          value={twilioNumber}
          onChangeText={(value) => {
            if (!value.startsWith('+1')) {
              setTwilioNumber(`+1${value.replace(/^\+?1?/, '')}`);
              return;
            }
            setTwilioNumber(value);
          }}
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
