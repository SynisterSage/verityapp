import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';

const formatPhone = (digits: string) => {
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

export default function CreateProfileScreen({ navigation }: { navigation: any }) {
  const { activeProfile, setActiveProfile, setOnboardingComplete } = useProfile();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [twilioDigits, setTwilioDigits] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formattedPhone = useMemo(() => formatPhone(phoneDigits), [phoneDigits]);
  const formattedTwilio = useMemo(() => formatPhone(twilioDigits), [twilioDigits]);
  const isFormValid = Boolean(firstName.trim() && lastName.trim() && phoneDigits.length === 10);

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setPhoneDigits(digits);
  };

  const handleTwilioChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setTwilioDigits(digits);
  };

  const handleContinue = async () => {
    if (activeProfile) {
      navigation.navigate('OnboardingPasscode');
      return;
    }
    if (!isFormValid) {
      setError('Complete all required fields.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: phoneDigits ? `+1${phoneDigits}` : null,
        twilio_virtual_number: twilioDigits ? `+1${twilioDigits}` : null,
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
      <KeyboardAvoidingView
        style={styles.outer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={styles.screen} edges={['bottom']}>
          <OnboardingHeader chapter="Identity" activeStep={3} totalSteps={9} />
          <ScrollView
            contentContainerStyle={[
              styles.body,
              { paddingTop: 28, flexGrow: 1 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Profile Already Created</Text>
              <Text style={styles.subtitle}>
                Continue onboarding for {activeProfile.first_name} {activeProfile.last_name}.
              </Text>
            </View>
          </ScrollView>
          <View style={styles.actionContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  opacity: pressed ? 0.9 : 1,
                  backgroundColor: '#2d6df6',
                },
              ]}
              onPress={handleContinue}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <OnboardingHeader chapter="Identity" activeStep={3} totalSteps={9} />

        <ScrollView
          contentContainerStyle={[
            styles.body,
            {
              paddingTop: 28,
              flexGrow: 1,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Who is this for?</Text>
            <Text style={styles.subtitle}>
              Set up the profile for the protected individual.
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>First name</Text>
            <View style={[styles.inputContainer, { borderColor: '#1b2534' }]}>
              <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.input}
                placeholder="e.g. Martha"
                placeholderTextColor="#8aa0c6"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
            </View>

            <Text style={styles.inputLabel}>Last name</Text>
            <View style={[styles.inputContainer, { borderColor: '#1b2534' }]}>
              <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.input}
                placeholder="e.g. Stewart"
                placeholderTextColor="#8aa0c6"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>

            <Text style={styles.inputLabel}>Mobile number</Text>
            <View style={[styles.inputContainer, { borderColor: '#1b2534' }]}>
              <Ionicons name="call-outline" size={18} color="rgba(255,255,255,0.4)" />
              <Text style={styles.prefix}>+1</Text>
              <TextInput
                style={[styles.input, styles.phoneInput]}
                placeholder="(000) 000-0000"
                placeholderTextColor="#8aa0c6"
                keyboardType="phone-pad"
                value={formattedPhone}
                onChangeText={handlePhoneChange}
              />
            </View>

            <Text style={styles.inputLabel}>Twilio number</Text>
            <View style={[styles.inputContainer, { borderColor: '#1b2534' }]}>
              <Ionicons name="call-outline" size={18} color="rgba(255,255,255,0.4)" />
              <Text style={styles.prefix}>+1</Text>
              <TextInput
                style={[styles.input, styles.phoneInput]}
                placeholder="(000) 000-0000"
                placeholderTextColor="#8aa0c6"
                keyboardType="phone-pad"
                value={formattedTwilio}
                onChangeText={handleTwilioChange}
              />
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.actionContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              {
                opacity: !isFormValid || isSubmitting ? 0.3 : pressed ? 0.85 : 1,
                backgroundColor: '#2d6df6',
              },
            ]}
            onPress={handleContinue}
            disabled={!isFormValid || isSubmitting}
          >
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? 'Saving…' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  screen: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  body: {
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
  header: {
    marginBottom: 10,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.35,
    color: '#f5f7fb',
    lineHeight: 40,
    maxWidth: 320,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#8aa0c6',
    marginTop: 8,
    maxWidth: 320,
  },
  inputGroup: {
    marginTop: 24,
    gap: 16,
  },
  inputLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    color: '#8aa0c6',
    marginBottom: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1b2534',
    paddingHorizontal: 12,
    gap: 12,
    backgroundColor: '#121a26',
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  phoneInput: {
    letterSpacing: 1,
  },
  prefix: {
    color: '#8aa0c6',
    fontWeight: '600',
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
    textAlign: 'center',
  },
  actionContainer: {
    paddingHorizontal: 32,
    paddingBottom: 32,
  },
  primaryButton: {
    height: 60,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
