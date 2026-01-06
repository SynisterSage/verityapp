import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfile } from '../../context/ProfileContext';

export default function OnboardingCallForwardingScreen({ navigation }: { navigation: any }) {
  const { activeProfile } = useProfile();
  const isIOS = Platform.OS === 'ios';
  const twilioNumber = activeProfile?.twilio_virtual_number ?? '';
  const insets = useSafeAreaInsets();
  const screenshots = [
    require('../../assets/onboarding/1.png'),
    require('../../assets/onboarding/2.png'),
    require('../../assets/onboarding/3.png'),
  ];

  const steps = isIOS
    ? [
        { title: 'Open Settings', detail: 'Tap Phone to access call settings.' },
        { title: 'Enable Call Forwarding', detail: 'Turn it on and select Forward To.' },
        { title: 'Set the SafeCall number', detail: 'Enter the SafeCall number below.' },
      ]
    : [
        { title: 'Open the Phone app', detail: 'Go to Menu → Settings.' },
        { title: 'Find Call Forwarding', detail: 'Look for Calls → Call forwarding.' },
        { title: 'Forward to SafeCall', detail: 'Enter your SafeCall number.' },
      ];

  const openSystem = async () => {
    if (!isIOS) {
      return;
    }
    const phoneSettingsUrl = 'App-Prefs:root=Phone';
    const canOpen = await Linking.canOpenURL(phoneSettingsUrl);
    if (canOpen) {
      await Linking.openURL(phoneSettingsUrl);
      return;
    }
    await Linking.openURL('app-settings:');
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Call Forwarding</Text>
        <Text style={styles.subtitle}>
          Forward calls from your phone to SafeCall so screening works every time.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>SafeCall number</Text>
          <Text style={styles.value}>{twilioNumber || 'Connect a number in settings'}</Text>
        </View>

        <View style={styles.stepsCard}>
          {steps.map((step, index) => (
            <View key={step.title} style={styles.stepBlock}>
              <View style={styles.stepHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{index + 1}</Text>
                </View>
                <View style={styles.stepTextBlock}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDetail}>{step.detail}</Text>
                </View>
              </View>
              {isIOS ? (
                <View style={styles.shotCard}>
                  <Image source={screenshots[index]} style={styles.shotImage} resizeMode="contain" />
                </View>
              ) : (
                <View style={styles.shotPlaceholder}>
                  <Ionicons name="phone-portrait-outline" size={24} color="#8ab4ff" />
                  <Text style={styles.shotCaption}>Follow the steps on your device.</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <TouchableOpacity style={styles.secondaryButton} onPress={openSystem}>
          <Text style={styles.secondaryButtonText}>
            {isIOS ? 'Open Settings' : 'Open Phone app'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('OnboardingTestCall')}
        >
          <Text style={styles.primaryButtonText}>I turned it on</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    padding: 24,
  },
  content: {
    paddingBottom: 140,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f5f7fb',
  },
  subtitle: {
    color: '#b5c0d3',
    marginTop: 6,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    marginBottom: 16,
  },
  label: {
    color: '#8aa0c6',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    color: '#f5f7fb',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 6,
  },
  stepsCard: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    gap: 12,
  },
  stepBlock: {
    gap: 12,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1c2a3d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: '#8ab4ff',
    fontWeight: '700',
    fontSize: 12,
  },
  stepTextBlock: {
    flex: 1,
  },
  stepTitle: {
    color: '#e6ebf5',
    fontWeight: '600',
  },
  stepDetail: {
    color: '#8aa0c6',
    marginTop: 2,
    fontSize: 12,
  },
  shotCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#243247',
    padding: 12,
    backgroundColor: '#0f1724',
  },
  shotImage: {
    width: '100%',
    height: 200,
  },
  shotPlaceholder: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#243247',
    padding: 16,
    backgroundColor: '#0f1724',
    alignItems: 'center',
    gap: 8,
  },
  shotCaption: {
    color: '#8aa0c6',
    fontSize: 12,
    textAlign: 'center',
  },
  footer: {
    gap: 12,
    paddingTop: 12,
    backgroundColor: '#0b111b',
    borderTopWidth: 1,
    borderTopColor: '#111a28',
  },
  secondaryButton: {
    backgroundColor: '#121a26',
    borderWidth: 1,
    borderColor: '#243247',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#8ab4ff',
    fontWeight: '600',
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
});
