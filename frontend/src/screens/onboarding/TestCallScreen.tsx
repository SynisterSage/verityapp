import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { authorizedFetch } from '../../services/backend';

import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import ReliableFallbackInfoModal from '../../components/common/ReliableFallbackInfoModal';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';
import { formatPhoneNumber } from '../../utils/formatPhoneNumber';

function formatUsPhoneNumber(raw?: string | null) {
  if (!raw) {
    return '';
  }

  const digits = raw.replace(/\D/g, '');
  const normalizedDigits =
    digits.length === 10 ? `1${digits}` : digits.length === 11 && digits.startsWith('1') ? digits : '';
  if (!normalizedDigits) {
    return formatPhoneNumber(raw, raw);
  }

  const national = normalizedDigits.slice(1);
  const area = national.slice(0, 3);
  const prefix = national.slice(3, 6);
  const line = national.slice(6, 10);

  return `+1 (${area}) ${prefix}-${line}`;
}

export default function TestCallScreen({ navigation }: { navigation: any }) {
  const { activeProfile, passcodeDraft, setActiveProfile, setRedirectToSettings } =
    useProfile();
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createTestCallStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [showFallbackInfoModal, setShowFallbackInfoModal] = useState(false);

  const twilioNumber = activeProfile?.twilio_virtual_number ?? '';
  const redirectNumber = activeProfile?.fallback_phone_number ?? '';
  const passcode = (activeProfile as any)?.safety_pin ?? passcodeDraft ?? '';
  const displayTwilioNumber = twilioNumber ? formatUsPhoneNumber(twilioNumber) : '';
  const displayRedirectNumber = redirectNumber ? formatUsPhoneNumber(redirectNumber) : '';

  const finishOnboarding = () => {
    setRedirectToSettings(false);
    navigation.navigate('OnboardingSuccess');
  };

  const handleCopyNumber = async () => {
    if (!twilioNumber) return;
    await Clipboard.setStringAsync(twilioNumber);
    Haptics.selectionAsync();
  };

  const handleCopyPin = async () => {
    if (!passcode) return;
    await Clipboard.setStringAsync(passcode);
    Haptics.selectionAsync();
  };

  const handleCopyRedirectNumber = async () => {
    if (!redirectNumber) return;
    await Clipboard.setStringAsync(redirectNumber);
    Haptics.selectionAsync();
  };

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const reloadActiveProfile = async () => {
        if (!activeProfile?.id) return;
        try {
          const data = await authorizedFetch('/profiles');
          const profiles = (data?.profiles ?? []) as Array<Record<string, any>>;
          const refreshed = profiles.find((profile) => profile.id === activeProfile.id);
          if (isActive && refreshed) {
            setActiveProfile(refreshed as any);
          }
        } catch {
          // keep local profile if refresh fails
        }
      };
      void reloadActiveProfile();
      return () => {
        isActive = false;
      };
    }, [activeProfile?.id, setActiveProfile])
  );

  const helperItems = useMemo(
    () => [
      {
        icon: 'call-outline',
        color: theme.colors.accent,
        text: 'Dial your Verity number from any phone to test the flow.',
      },
      {
        icon: 'keypad-outline',
        color: theme.colors.success,
        text: 'Enter your 6-digit Safety PIN when prompted.',
      },
      {
        icon: 'mic-outline',
        color: theme.colors.textMuted,
        text: 'Leave a short voicemail to test recording and transcription.',
      },
    ],
    [theme.colors.accent, theme.colors.success, theme.colors.textMuted]
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <OnboardingHeader chapter="Security" activeStep={9} totalSteps={9} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 32) + 220,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Test Call Flow</Text>
          <Text style={styles.subtitle}>
            Test your setup by calling from another phone to verify PIN and voicemail recording.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.infoCard,
            pressed && styles.infoCardPressed,
          ]}
          onPress={handleCopyNumber}
        >
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.accent }]}>
            <Ionicons name="call" size={20} color={theme.colors.surface} />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Verity Number</Text>
            <Text style={styles.infoValue}>
              {displayTwilioNumber || 'Configure in settings'}
            </Text>
          </View>
          <View style={styles.copyIcon}>
            <Ionicons name="copy-outline" size={18} color={theme.colors.textMuted} />
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.infoCard,
            pressed && styles.infoCardPressed,
          ]}
          onPress={handleCopyRedirectNumber}
        >
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.warning ?? theme.colors.accent }]}>
            <Ionicons name="swap-horizontal-outline" size={20} color={theme.colors.surface} />
          </View>
          <View style={styles.infoContent}>
            <View style={styles.infoLabelRow}>
              <Text style={styles.infoLabel}>Fallback number</Text>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  setShowFallbackInfoModal(true);
                }}
                hitSlop={8}
                style={({ pressed }) => [styles.infoHelpButton, pressed && styles.infoHelpButtonPressed]}
              >
                <Ionicons name="help-circle-outline" size={14} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.infoValue}>
              {displayRedirectNumber || 'Not set'}
            </Text>
          </View>
          <View style={styles.copyIcon}>
            <Ionicons name="copy-outline" size={18} color={theme.colors.textMuted} />
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.infoCard,
            pressed && styles.infoCardPressed,
          ]}
          onPress={handleCopyPin}
        >
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.success }]}>
            <Ionicons name="keypad" size={20} color={theme.colors.surface} />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Safety PIN</Text>
            <Text style={styles.infoValue}>
              {passcode || 'Not set'}
            </Text>
          </View>
          <View style={styles.copyIcon}>
            <Ionicons name="copy-outline" size={18} color={theme.colors.textMuted} />
          </View>
        </Pressable>

        <HowItWorksCard caption="TEST STEPS" items={helperItems} />
      </ScrollView>

      <ActionFooter
        primaryLabel="Finish Setup"
        onPrimaryPress={finishOnboarding}
        secondaryLabel="Skip for now"
        onSecondaryPress={finishOnboarding}
      />
      <ReliableFallbackInfoModal
        visible={showFallbackInfoModal}
        onClose={() => setShowFallbackInfoModal(false)}
        theme={theme}
        mode={mode}
      />
    </SafeAreaView>
  );
}

const createTestCallStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    content: {
      paddingHorizontal: 32,
      paddingTop: 28,
      gap: 24,
    },
    header: {
      marginBottom: 8,
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
    infoCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 32,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.border,
      shadowOpacity: 0.25,
      shadowRadius: 40,
      shadowOffset: { width: 0, height: 12 },
      elevation: 18,
      marginVertical: -8,
    },
    infoCardPressed: {
      opacity: 0.8,
    },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoContent: {
      flex: 1,
      gap: 4,
    },
    infoLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
    },
    infoLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    infoHelpButton: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.border, 0.9),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.surface, 0.8),
    },
    infoHelpButtonPressed: {
      opacity: 0.72,
    },
    infoValue: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },
    copyIcon: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
