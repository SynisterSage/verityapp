import { useMemo, useRef, useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import { useSubscription } from '../../context/SubscriptionContext';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import ReliableFallbackInfoModal from '../../components/common/ReliableFallbackInfoModal';
import VerityNumberInfoModal from '../../components/common/VerityNumberInfoModal';
import RecipientPhoneInfoModal from '../../components/common/RecipientPhoneInfoModal';
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
  const { activeProfile, setActiveProfile, setOnboardingComplete } = useProfile();
  const { refreshStatus } = useSubscription();
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
  const [showCallFlowModal, setShowCallFlowModal] = useState(false);
  const [showFallbackInfoModal, setShowFallbackInfoModal] = useState(false);
  const [showVerityNumberInfoModal, setShowVerityNumberInfoModal] = useState(false);
  const [showRecipientPhoneInfoModal, setShowRecipientPhoneInfoModal] = useState(false);
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createProfileStyles(theme, mode), [theme, mode]);
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
        // Pull a fresh profile snapshot without triggering global loading/navigation reset.
        const profilesData = await authorizedFetch('/profiles');
        const refreshedProfiles = (profilesData?.profiles ?? []) as Array<Record<string, any>>;
        const refreshedProfile =
          refreshedProfiles.find((profile) => profile.id === profileId) ?? null;
        if (refreshedProfile) {
          setActiveProfile(refreshedProfile as any);
        }
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
      } else if (
        errorMessage.includes('Active membership required') ||
        errorMessage.includes('SUBSCRIPTION_REQUIRED')
      ) {
        const snapshot = await refreshStatus();
        setError('Membership required to continue setup.');
        if (!snapshot) {
          setError('Membership status could not be verified. Please try again.');
        }
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

  const proceedToPasscode = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'OnboardingPasscode' }],
    });
  };

  const handleContinue = () => {
    if (!assignedNumber) {
      setError('Please assign a Verity number first.');
      return;
    }

    setShowCallFlowModal(true);
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

        <View style={styles.inputLabelRow}>
          <Text style={styles.inputLabel}>Recipient phone</Text>
          <Pressable
            style={({ pressed }) => [styles.labelHelpButton, pressed && styles.labelHelpButtonPressed]}
            onPress={() => setShowRecipientPhoneInfoModal(true)}
            hitSlop={8}
          >
            <Ionicons name="help-circle-outline" size={16} color={theme.colors.textMuted} />
          </Pressable>
        </View>
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

        <View style={styles.inputLabelRow}>
          <Text style={styles.inputLabel}>Reliable fallback number (optional)</Text>
          <Pressable
            style={({ pressed }) => [styles.labelHelpButton, pressed && styles.labelHelpButtonPressed]}
            onPress={() => setShowFallbackInfoModal(true)}
            hitSlop={8}
          >
            <Ionicons name="help-circle-outline" size={16} color={theme.colors.textMuted} />
          </Pressable>
        </View>
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
        <Text style={styles.fallbackHint}>Optional. Used only if in-app calling is unavailable.</Text>

        <View style={styles.inputLabelRow}>
          <Text style={styles.inputLabel}>Verity number</Text>
          <Pressable
            style={({ pressed }) => [styles.labelHelpButton, pressed && styles.labelHelpButtonPressed]}
            onPress={() => setShowVerityNumberInfoModal(true)}
            hitSlop={8}
          >
            <Ionicons name="help-circle-outline" size={16} color={theme.colors.textMuted} />
          </Pressable>
        </View>
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
                  text: 'When someone calls your Verity number, we screen the call first to protect you from scams.',
                },
                {
                  icon: 'call-outline',
                  color: theme.colors.accent,
                  text: 'If your app is ready, we ring you in the app first. If the app is unavailable, we call your fallback number.',
                },
                {
                  icon: 'settings-outline',
                  color: theme.colors.textMuted,
                  text: 'Use a direct fallback number that does not forward back to Verity, so calls never loop.',
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
        <Modal visible={showCallFlowModal} transparent animationType="none" onRequestClose={() => setShowCallFlowModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>How your calls will work</Text>
              <Text style={styles.modalBody}>
                Calls to your Verity number are screened first, then sent to you in the safest way.
              </Text>

              <View style={styles.modalRow}>
                <Ionicons name="shield-checkmark" size={18} color={theme.colors.success} />
                <Text style={styles.modalRowText}>We try your Verity app first for the best protection.</Text>
              </View>
              <View style={styles.modalRow}>
                <Ionicons name="call-outline" size={18} color={theme.colors.accent} />
                <Text style={styles.modalRowText}>If the app is unavailable, we call your fallback number.</Text>
              </View>
              <View style={styles.modalRow}>
                <Ionicons name="notifications-outline" size={18} color={theme.colors.textMuted} />
                <Text style={styles.modalRowText}>
                  If your app has been inactive for a while, we send a reminder so your line stays ready.
                </Text>
              </View>

              <View style={styles.modalActions}>
                <Pressable style={styles.modalSecondaryButton} onPress={() => setShowCallFlowModal(false)}>
                  <Text style={styles.modalSecondaryText}>Back</Text>
                </Pressable>
                <Pressable style={styles.modalPrimaryButton} onPress={proceedToPasscode}>
                  <Text style={styles.modalPrimaryText}>Got it, continue</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <ReliableFallbackInfoModal
          visible={showFallbackInfoModal}
          onClose={() => setShowFallbackInfoModal(false)}
          theme={theme}
          mode={mode}
        />
        <VerityNumberInfoModal
          visible={showVerityNumberInfoModal}
          onClose={() => setShowVerityNumberInfoModal(false)}
          theme={theme}
          mode={mode}
          context="onboarding"
        />
        <RecipientPhoneInfoModal
          visible={showRecipientPhoneInfoModal}
          onClose={() => setShowRecipientPhoneInfoModal(false)}
          theme={theme}
          mode={mode}
        />
      </SafeAreaView>
    </View>
  );
}

const createProfileStyles = (theme: AppTheme, mode?: string) =>
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
    fallbackHint: {
      marginTop: -8,
      marginBottom: 2,
      fontSize: 12,
      color: theme.colors.textDim,
      lineHeight: 16,
    },
    inputLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    labelHelpButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.border, 0.6),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.surface, 0.55),
    },
    labelHelpButtonPressed: {
      opacity: 0.72,
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
    modalOverlay: {
      flex: 1,
      backgroundColor: withOpacity(theme.colors.bg, 0.72),
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    modalCard: {
      borderRadius: 28,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 20,
      paddingVertical: 22,
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: mode === 'dark' ? 0.35 : 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
    modalTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: '700',
      textAlign: 'center',
    },
    modalBody: {
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      marginBottom: 2,
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    modalRowText: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 20,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    modalSecondaryButton: {
      flex: 1,
      height: 46,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    modalSecondaryText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      fontWeight: '600',
    },
    modalPrimaryButton: {
      flex: 1,
      height: 46,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
    },
    modalPrimaryText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
  });
