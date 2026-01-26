import { useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';

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
  const insets = useSafeAreaInsets();
  const { activeProfile, setActiveProfile, setOnboardingComplete } = useProfile();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [twilioDigits, setTwilioDigits] = useState('');
  const lastPhoneKey = useRef<string | null>(null);
  const lastTwilioKey = useRef<string | null>(null);
  const lastNameRef = useRef<TextInput | null>(null);
  const phoneRef = useRef<TextInput | null>(null);
  const twilioRef = useRef<TextInput | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { theme } = useTheme();
  const styles = useMemo(() => createProfileStyles(theme), [theme]);
  const placeholderColor = withOpacity(theme.colors.textMuted, 0.7);

  const formattedPhone = useMemo(() => formatPhone(phoneDigits), [phoneDigits]);
  const formattedTwilio = useMemo(() => formatPhone(twilioDigits), [twilioDigits]);
  const isFormValid = Boolean(firstName.trim() && lastName.trim() && phoneDigits.length === 10);
  const primaryDisabled = activeProfile ? isSubmitting : !isFormValid || isSubmitting;

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (lastPhoneKey.current === 'Backspace' && digits.length === phoneDigits.length) {
      setPhoneDigits((prev) => prev.slice(0, -1));
    } else {
      setPhoneDigits(digits);
    }
    lastPhoneKey.current = null;
  };

  const handleTwilioChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (lastTwilioKey.current === 'Backspace' && digits.length === twilioDigits.length) {
      setTwilioDigits((prev) => prev.slice(0, -1));
    } else {
      setTwilioDigits(digits);
    }
    lastTwilioKey.current = null;
  };

  const handlePhoneKeyPress = ({ nativeEvent }: { nativeEvent: { key: string } }) => {
    lastPhoneKey.current = nativeEvent.key;
  };

  const handleTwilioKeyPress = ({ nativeEvent }: { nativeEvent: { key: string } }) => {
    lastTwilioKey.current = nativeEvent.key;
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

  const renderScrollContent = () => (
    <ScrollView
      contentContainerStyle={[
        styles.body,
        {
          paddingTop: 28,
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom, 32) + 220,
        },
      ]}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.title}>Who is this for?</Text>
        <Text style={styles.subtitle}>
          Set up the profile for the protected individual.
        </Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>First name</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="person-outline" size={18} color={withOpacity(theme.colors.text, 0.45)} />
          <TextInput
            style={styles.input}
            placeholder="e.g. Martha"
            placeholderTextColor={placeholderColor}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => lastNameRef.current?.focus()}
          />
        </View>

        <Text style={styles.inputLabel}>Last name</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="person-outline" size={18} color={withOpacity(theme.colors.text, 0.45)} />
          <TextInput
            style={styles.input}
            placeholder="e.g. Stewart"
            placeholderTextColor={placeholderColor}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            ref={lastNameRef}
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />
        </View>

        <Text style={styles.inputLabel}>Mobile number</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="call-outline" size={18} color={withOpacity(theme.colors.text, 0.45)} />
          <Text style={styles.prefix}>+1</Text>
          <TextInput
            style={[styles.input, styles.phoneInput]}
            placeholder="(000) 000-0000"
            placeholderTextColor={placeholderColor}
            keyboardType="phone-pad"
            value={formattedPhone}
            onChangeText={handlePhoneChange}
            onKeyPress={handlePhoneKeyPress}
            ref={phoneRef}
            returnKeyType="next"
            onSubmitEditing={() => twilioRef.current?.focus()}
          />
        </View>

        <Text style={styles.inputLabel}>Verity number</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="call-outline" size={18} color={withOpacity(theme.colors.text, 0.45)} />
          <Text style={styles.prefix}>+1</Text>
          <TextInput
            style={[styles.input, styles.phoneInput]}
            placeholder="(000) 000-0000"
            placeholderTextColor={placeholderColor}
            keyboardType="phone-pad"
            value={formattedTwilio}
            onChangeText={handleTwilioChange}
            onKeyPress={handleTwilioKeyPress}
            ref={twilioRef}
          />
        </View>
            <HowItWorksCard
              caption="HOW IT WORKS"
              items={[
                {
                  icon: 'shield-checkmark',
                  color: theme.colors.success,
                  text: 'Your Verity number lets us screen incoming calls before they reach you.',
                },
                {
                  icon: 'call-outline',
                  color: theme.colors.accent,
                  text: 'It is not a replacement number; your phone stays the same while Verity guards the line.',
                },
                {
                  icon: 'settings-outline',
                  color: theme.colors.textMuted,
                  text: 'In a bit, we will show you how to connect it to your Mobile number.',
                },
              ]}
            />
          </View>


      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );

  if (activeProfile) {
    return (
      <View style={styles.outer}>
        <SafeAreaView style={styles.screen} edges={['bottom']}>
          <OnboardingHeader chapter="Identity" activeStep={3} totalSteps={9} />
          <View style={styles.keyboardAvoiding}>
            <ScrollView
              contentContainerStyle={[
                styles.body,
                {
                  paddingTop: 28,
                  flexGrow: 1,
                  paddingBottom: Math.max(insets.bottom, 32) + 220,
                },
              ]}
              showsVerticalScrollIndicator={false}
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.header}>
                <Text style={styles.title}>Profile Already Created</Text>
                <Text style={styles.subtitle}>
                  Continue setting up the profile for {activeProfile.first_name} {activeProfile.last_name}.
                </Text>
              </View>
            </ScrollView>
          </View>
          <ActionFooter
            primaryLabel="Continue"
            onPrimaryPress={handleContinue}
            primaryDisabled={primaryDisabled}
            primaryLoading={isSubmitting}
          />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <OnboardingHeader chapter="Identity" activeStep={3} totalSteps={9} />
        <View style={styles.keyboardAvoiding}>{renderScrollContent()}</View>
        <ActionFooter
          primaryLabel="Continue"
          primaryLoading={isSubmitting}
          onPrimaryPress={handleContinue}
          primaryDisabled={primaryDisabled}
        />
      </SafeAreaView>
    </View>
  );
}

const createProfileStyles = (theme: AppTheme) =>
  StyleSheet.create({
    outer: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
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
      color: theme.colors.text,
      lineHeight: 40,
      maxWidth: 320,
    },
    subtitle: {
      fontSize: 17,
      fontWeight: '500',
      color: theme.colors.textMuted,
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
      color: theme.colors.textMuted,
      marginBottom: 4,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 60,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      gap: 12,
      backgroundColor: theme.colors.surface,
    },
    input: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 16,
    },
    phoneInput: {
      letterSpacing: 1,
    },
    prefix: {
      color: theme.colors.textMuted,
      fontWeight: '600',
    },
    error: {
      color: theme.colors.danger,
      fontSize: 12,
      textAlign: 'center',
    },
    keyboardAvoiding: {
      flex: 1,
      width: '100%',
    },
  });
