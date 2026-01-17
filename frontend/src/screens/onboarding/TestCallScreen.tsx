import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { useLayoutEffect } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfile } from '../../context/ProfileContext';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';

export default function TestCallScreen({ navigation }: { navigation: any }) {
  const { activeProfile, refreshProfiles, setOnboardingComplete, setRedirectToSettings } =
    useProfile();
  const insets = useSafeAreaInsets();
  const finishOnboarding = async () => {
    setOnboardingComplete(true);
    setRedirectToSettings(false);
    await refreshProfiles();
    navigation.reset({
      index: 0,
      routes: [{ name: 'AppTabs' }],
    });
  };

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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
        <Text style={styles.title}>Test the Call Flow</Text>
        <Text style={styles.subtitle}>
          Call the SafeCall number and try the passcode + voicemail flow.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Twilio number</Text>
          <Text style={styles.value}>
            {activeProfile?.twilio_virtual_number ?? 'Set this later in settings'}
          </Text>
          <Text style={styles.hint}>
            Dial this number, enter the passcode, and leave a voicemail if prompted.
          </Text>
        </View>
      </ScrollView>

      <ActionFooter primaryLabel="Finish Setup" onPrimaryPress={finishOnboarding} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b111b',
  },
  content: {
    padding: 32,
    flexGrow: 1,
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
  },
  label: {
    color: '#8aa0c6',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    color: '#f5f7fb',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 6,
  },
  hint: {
    color: '#9fb0c8',
    marginTop: 10,
    lineHeight: 20,
  },
});
