import { useMemo, useRef, useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

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

const formatFullPhone = (phoneNumber: string) => {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // Extract parts (assumes 11 digits starting with '1' or 10 digits)
  const hasCountryCode = digits.length === 11 && digits[0] === '1';
  const phoneDigits = hasCountryCode ? digits.slice(1) : digits;
  
  const area = phoneDigits.slice(0, 3);
  const prefix = phoneDigits.slice(3, 6);
  const line = phoneDigits.slice(6, 10);
  
  return `+1 (${area}) ${prefix}-${line}`;
};

export default function CreateProfileScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { activeProfile, setActiveProfile, setOnboardingComplete, refreshProfiles } = useProfile();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [fallbackPhoneDigits, setFallbackPhoneDigits] = useState('');
  const [assignedNumber, setAssignedNumber] = useState(activeProfile?.twilio_virtual_number || '');
  const [isAssigningNumber, setIsAssigningNumber] = useState(false);
  const lastPhoneKey = useRef<string | null>(null);
  const lastNameRef = useRef<TextInput | null>(null);
  const phoneRef = useRef<TextInput | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { theme } = useTheme();
  const styles = useMemo(() => createProfileStyles(theme), [theme]);
  const placeholderColor = withOpacity(theme.colors.textMuted, 0.7);

  const formattedPhone = useMemo(() => formatPhone(phoneDigits), [phoneDigits]);
  const formattedFallbackPhone = useMemo(() => formatPhone(fallbackPhoneDigits), [fallbackPhoneDigits]);
  const isProfileInfoComplete = Boolean(firstName.trim() && lastName.trim() && phoneDigits.length === 10);
  const isFormValid = Boolean(assignedNumber); // Continue only enabled after number assigned
  const primaryDisabled = !isFormValid || isSubmitting;

  // Sync assignedNumber when profile loads/changes
  useEffect(() => {
    if (activeProfile?.twilio_virtual_number && !assignedNumber) {
      setAssignedNumber(activeProfile.twilio_virtual_number);
    }
  }, [activeProfile?.twilio_virtual_number, assignedNumber]);

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (lastPhoneKey.current === 'Backspace' && digits.length === phoneDigits.length) {
      setPhoneDigits((prev) => prev.slice(0, -1));
    } else {
      setPhoneDigits(digits);
    }
    lastPhoneKey.current = null;
  };

  const handlePhoneKeyPress = ({ nativeEvent }: { nativeEvent: { key: string } }) => {
    lastPhoneKey.current = nativeEvent.key;
  };

  const handleAssignNumber = async () => {
    if (!isProfileInfoComplete) {
      setError('Please fill in all fields first.');
      return;
    }
    
    setError('');
    setIsAssigningNumber(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);

    try {
      // Create profile first if it doesn't exist
      let profileId = activeProfile?.id;
      
      if (!profileId) {
        const payload = {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: phoneDigits ? `+1${phoneDigits}` : null,
          fallback_phone_number: fallbackPhoneDigits ? `+1${fallbackPhoneDigits}` : null,
          twilio_virtual_number: null,
        };
        const profileData = await authorizedFetch('/profiles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        
        if (!profileData?.profile?.id) {
          throw new Error('Failed to create profile');
        }
        
        profileId = profileData.profile.id;
        setActiveProfile(profileData.profile);
        setOnboardingComplete(false);
      }
      
      // Now assign number
      console.log('🔄 Assigning number to profile:', profileId);
      const response = await authorizedFetch(`/profiles/${profileId}/assign-number`, {
        method: 'POST',
      });
      console.log('✅ Assign response:', response);
      
      if (response?.phoneNumber) {
        setAssignedNumber(response.phoneNumber);
        // Update activeProfile with the assigned number
        const updatedProfile = {
          ...(activeProfile || {}),
          id: profileId,
          twilio_virtual_number: response.phoneNumber,
        } as any;
        setActiveProfile(updatedProfile);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      } else {
        throw new Error('No phone number returned');
      }
    } catch (err: any) {
      console.error('❌ Assign number error:', err);
      console.error('Error details:', JSON.stringify(err, null, 2));
      
      // Handle specific error cases
      const errorMessage = err?.message || '';
      const statusCode = err?.status;
      
      if (statusCode === 429 || errorMessage.includes('Too many')) {
        setError(
          'Too many assignment attempts. Please wait an hour before trying again.'
        );
      } else if (errorMessage.toLowerCase().includes('no available') || errorMessage.toLowerCase().includes('no numbers')) {
        setError(
          'No phone numbers available in the pool. Please contact Verity Support to add more numbers to your account.'
        );
      } else {
        setError(errorMessage || 'Failed to assign number. Please try again.');
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => null);
    } finally {
      setIsAssigningNumber(false);
    }
  };

  const handleContinue = async () => {
    if (!assignedNumber) {
      setError('Please assign a Verity number first.');
      return;
    }
    
    // Reset navigation stack to prevent going back to profile creation
    navigation.reset({
      index: 0,
      routes: [{ name: 'OnboardingPasscode' }],
    });
  };

  const renderScrollContent = () => (
    <ScrollView
      contentContainerStyle={[
        styles.body,
        {
          paddingTop: 28,
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom, 32) + 100,
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
            returnKeyType="done"
          />
        </View>

        <Text style={styles.inputLabel}>Reliable fallback number</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="call-outline" size={18} color={withOpacity(theme.colors.text, 0.45)} />
          <Text style={styles.prefix}>+1</Text>
          <TextInput
            style={[styles.input, styles.phoneInput]}
            placeholder="(000) 000-0000"
            placeholderTextColor={placeholderColor}
            keyboardType="phone-pad"
            value={formattedFallbackPhone}
            onChangeText={(value) => setFallbackPhoneDigits(value.replace(/\D/g, '').slice(0, 10))}
            returnKeyType="done"
          />
        </View>
        <Text style={styles.inputHint}>
          Optional. Use a direct number that does not forward to the Verity line.
        </Text>

        <Text style={styles.inputLabel}>Verity number</Text>
        {!assignedNumber ? (
          <Pressable
            style={({ pressed }) => [
              styles.assignButton,
              pressed && { opacity: 0.7 },
              (isAssigningNumber || !isProfileInfoComplete) && styles.assignButtonLoading,
            ]}
            onPress={handleAssignNumber}
            disabled={isAssigningNumber || !isProfileInfoComplete}
          >
            {isAssigningNumber ? (
              <ActivityIndicator size="small" color={theme.colors.bg} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color={theme.colors.bg} />
                <Text style={styles.assignButtonText}>Assign Verity Number</Text>
              </>
            )}
          </Pressable>
        ) : (
          <View style={styles.assignedNumberCard}>
            <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
            <Text style={styles.assignedNumberText} numberOfLines={1}>
              {formatFullPhone(assignedNumber)}
            </Text>
          </View>
        )}
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

  // Show "Profile Already Created" screen only if profile exists from a previous session
  // (has profile but came back without going through the form flow)
  // If they just created it and assigned a number, keep them on the form
  if (activeProfile && activeProfile.twilio_virtual_number && !assignedNumber) {
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
    inputHint: {
      fontSize: 12,
      color: theme.colors.textDim,
      marginTop: -8,
      marginBottom: 4,
      lineHeight: 16,
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
    assignButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 60,
      borderRadius: 32,
      backgroundColor: theme.colors.accent,
      gap: 8,
      paddingHorizontal: 24,
    },
    assignButtonLoading: {
      opacity: 0.6,
    },
    assignButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.bg,
    },
    assignedNumberCard: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 60,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: theme.colors.success,
      backgroundColor: withOpacity(theme.colors.success, 0.1),
      paddingHorizontal: 20,
      gap: 12,
    },
    assignedNumberText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text,
      letterSpacing: 0.5,
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
