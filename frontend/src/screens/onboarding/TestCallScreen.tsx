import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useProfile } from '../../context/ProfileContext';

export default function TestCallScreen() {
  const { activeProfile, refreshProfiles, setOnboardingComplete } = useProfile();

  const finishOnboarding = async () => {
    setOnboardingComplete(true);
    await refreshProfiles();
  };

  return (
    <View style={styles.container}>
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

      <TouchableOpacity style={styles.primaryButton} onPress={finishOnboarding}>
        <Text style={styles.primaryButtonText}>Finish Setup</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    padding: 24,
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
    borderRadius: 14,
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
  primaryButton: {
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryButtonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
});
