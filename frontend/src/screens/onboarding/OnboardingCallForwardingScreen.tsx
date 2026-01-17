import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../../context/ThemeContext';
import ActionFooter from '../../components/onboarding/ActionFooter';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

const PLATFORM_OPTIONS: { value: 'ios' | 'droid' | 'home'; label: string }[] = [
  { value: 'ios', label: 'iOS' },
  { value: 'droid', label: 'Droid' },
  { value: 'home', label: 'Home' },
];

export default function OnboardingCallForwardingScreen({ navigation }: { navigation: any }) {
  const { activeProfile, setOnboardingComplete, setRedirectToSettings } = useProfile();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [activePlatform, setActivePlatform] = useState<'ios' | 'droid' | 'home'>(
    Platform.OS === 'ios' ? 'ios' : 'droid'
  );
  const twilioNumber = activeProfile?.twilio_virtual_number ?? '';
  const isIOS = Platform.OS === 'ios';
  const [copied, setCopied] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const instructionSets = useMemo(
    () => ({
      ios: [
        {
          title: 'Open Settings',
          instruction: 'Locate the Settings app on your home screen.',
          context: 'This is the starting point for all iOS system changes.',
        },
        {
          title: 'Phone & Forwarding',
          instruction: 'Tap Phone, then select Call Forwarding and switch it on.',
          context: 'Emphasize the “Phone” and “Call Forwarding” labels so older users can scan quicker.',
        },
        {
          title: 'Forward To',
          instruction: 'Tap Forward To and paste your Verity number.',
          context: 'This is the final bridge where the user inputs the number copied from the hero card.',
        },
      ],
      droid: [
        {
          title: 'Phone App',
          instruction: 'Open the Dialer, tap ⋮, and choose Settings.',
          context: 'Android call settings live inside the Phone app.',
        },
        {
          title: 'Supplementary Services',
          instruction: 'Find Supplementary Services or Calling Accounts.',
          context: 'Samsung and Pixel use these two headers most often.',
        },
        {
          title: 'Always Forward',
          instruction: 'Select Always Forward and enter your Verity number.',
          context: '“Always Forward” diverts all incoming traffic.',
        },
      ],
      home: [
        {
          title: 'Activation Code',
          instruction: 'On your home phone, dial *72.',
          context: 'Emphasize the *72 sequence so it stands out.',
        },
        {
          title: 'Enter Number',
          instruction: 'Immediately after the code, enter the 10-digit Verity number.',
          context: 'Don’t wait for a second dial tone before typing.',
        },
        {
          title: 'Listen',
          instruction: 'Stay on the line for the confirmation tone then hang up.',
          context: 'This confirms the carrier accepted the forwarding.',
        },
      ],
    }),
    []
  );

  const openSystem = async () => {
    if (!isIOS) return Linking.openURL('app-settings:');
    const phoneSettingsUrl = 'App-Prefs:root=Phone';
    const canOpen = await Linking.canOpenURL(phoneSettingsUrl);
    if (canOpen) {
      await Linking.openURL(phoneSettingsUrl);
      return;
    }
    await Linking.openURL('app-settings:');
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (copied) {
      timer = setTimeout(() => setCopied(false), 2000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [copied]);

  const handleCopy = async () => {
    if (!twilioNumber) return;
    await Clipboard.setStringAsync(twilioNumber);
    Haptics.selectionAsync();
    setCopied(true);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <OnboardingHeader chapter="Setup" activeStep={8} totalSteps={9} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 32) + 220,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerGroup}>
          <Text style={styles.screenTitle}>Activate Verity</Text>
          <Text style={styles.screenSubtitle}>
            Redirect calls to your Verity number to begin active screening.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.numberCard,
            { backgroundColor: theme.colors.surface },
            pressed && styles.numberCardPressed,
          ]}
          onPress={handleCopy}
        >
          <View style={[styles.numberIcon, { backgroundColor: theme.colors.accent }]}>
            <Ionicons name="keypad-outline" size={20} color="#fff" />
          </View>
          <View style={styles.numberText}>
            <Text style={styles.numberLabel}>Your forwarding number</Text>
            <Text style={[styles.numberValue, !twilioNumber && styles.missingValue]}>
              {twilioNumber || 'Missing #'}
            </Text>
            <Text style={styles.numberHint}>
              {twilioNumber ? 'Tap to copy number' : 'Add a Twilio number in profile settings.'}
            </Text>
          </View>
          <View style={styles.copyCircle}>
            <Ionicons
              name={copied ? 'checkmark' : 'copy'}
              size={18}
              color={copied ? '#10b981' : '#94a3b8'}
            />
          </View>
        </Pressable>

        <View style={styles.segmentControl}>
          {PLATFORM_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.segmentPill,
                activePlatform === option.value && styles.segmentPillActive,
              ]}
              onPress={() => setActivePlatform(option.value)}
            >
              <Text
                style={[
                  styles.segmentText,
                  activePlatform === option.value && styles.segmentTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.stepsCard}>
          {instructionSets[activePlatform].map((item, index) => (
            <View key={`${activePlatform}-${item.title}`} style={styles.stepRow}>
              <View style={[styles.stepCircle, { backgroundColor: theme.colors.accent }]}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{item.title}</Text>
                <Text style={styles.stepInstruction}>{item.instruction}</Text>
                <Text style={styles.stepContext}>{item.context}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable style={styles.secondaryCard} onPress={openSystem}>
          <View style={[styles.secondaryIcon, { borderColor: theme.colors.border }]}>
            <Ionicons name="open-outline" size={16} color={theme.colors.accent} />
          </View>
          <Text style={[styles.secondaryText, { color: theme.colors.accent }]}>
            Open System Settings
          </Text>
        </Pressable>

        <View style={{ height: 32 }} />
      </ScrollView>

      <ActionFooter
        primaryLabel={twilioNumber ? "I've turned it on" : 'Open Settings'}
        onPrimaryPress={() => {
          if (!twilioNumber) {
            setRedirectToSettings(true);
            setOnboardingComplete(true);
            navigation.reset({
              index: 0,
              routes: [{ name: 'AppTabs' }],
            });
            return;
          }
          navigation.navigate('OnboardingTestCall');
        }}
        secondaryLabel={twilioNumber ? 'Do this later' : undefined}
        onSecondaryPress={twilioNumber ? () => navigation.navigate('OnboardingTestCall') : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  content: {
    paddingHorizontal: 32,
    paddingTop: 28,
    gap: 20,
  },
  headerGroup: {
    gap: 10,
    marginBottom: 10,
  },
  screenTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: '#f5f7fb',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#8aa0c6',
  },
  numberCard: {
    borderRadius: 32,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#1b2534',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  numberCardPressed: {
    opacity: 0.95,
  },
  numberIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    flex: 1,
    gap: 4,
  },
  numberLabel: {
    color: '#94a3b8',
    fontSize: 12,
    letterSpacing: 1,
  },
  numberValue: {
    color: '#f5f7fb',
    fontSize: 22,
    fontWeight: '700',
  },
  numberHint: {
    color: '#94a3b8',
    fontSize: 12,
  },
  missingValue: {
    color: '#f87171',
  },
  copyCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1b2534',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: '#101726',
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  segmentPill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentPillActive: {
    backgroundColor: '#f5f7fb',
  },
  segmentText: {
    letterSpacing: 1.5,
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
  },
  segmentTextActive: {
    color: '#0b111b',
  },
  stepsCard: {
    backgroundColor: '#121a26',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#1b2534',
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    color: '#fff',
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    color: '#f5f7fb',
    fontSize: 14,
    fontWeight: '700',
  },
  stepInstruction: {
    color: '#f5f7fb',
    fontSize: 14,
    fontWeight: '600',
  },
  stepContext: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18,
  },
  secondaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#101726',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1b2534',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
