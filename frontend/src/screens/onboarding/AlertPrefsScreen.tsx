import { useMemo, useState } from 'react';
import { Keyboard, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import Slider from '@react-native-community/slider';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';

export default function AlertPrefsScreen({ navigation }: { navigation: any }) {
  const { activeProfile, setActiveProfile } = useProfile();
  const [threshold, setThreshold] = useState(activeProfile?.alert_threshold_score ?? 90);
  const [emailAlerts, setEmailAlerts] = useState(
    activeProfile?.enable_email_alerts ?? true
  );
  const [pushAlerts, setPushAlerts] = useState(
    activeProfile?.enable_push_alerts ?? true
  );
  const [smsAlerts, setSmsAlerts] = useState(
    activeProfile?.enable_sms_alerts ?? false
  );
  const [error, setError] = useState('');

  const handleContinue = async () => {
    if (!activeProfile) return;
    setError('');
    const numericThreshold = Number(threshold);
    if (Number.isNaN(numericThreshold) || numericThreshold <= 0 || numericThreshold > 100) {
      setError('Threshold must be between 1 and 100.');
      return;
    }
    try {
      Keyboard.dismiss();
      await authorizedFetch(`/profiles/${activeProfile.id}/alerts`, {
        method: 'PATCH',
        body: JSON.stringify({
          alert_threshold_score: numericThreshold,
          enable_email_alerts: emailAlerts,
          enable_push_alerts: pushAlerts,
          enable_sms_alerts: smsAlerts,
        }),
      });
      setActiveProfile({
        ...activeProfile,
        alert_threshold_score: numericThreshold,
        enable_email_alerts: emailAlerts,
        enable_push_alerts: pushAlerts,
        enable_sms_alerts: smsAlerts,
      });
      if (activeProfile.twilio_virtual_number) {
        navigation.navigate('OnboardingCallForwarding');
      } else {
        navigation.navigate('OnboardingTestCall');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update preferences.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Alert Preferences</Text>
        <Text style={styles.subtitle}>Tune when and how you get notified.</Text>

        <Text style={styles.sectionTitle}>Fraud threshold</Text>
        <View style={styles.card}>
          <View style={styles.thresholdRow}>
            <Text style={styles.label}>Alert score</Text>
            <Text style={styles.value}>{threshold}</Text>
          </View>
          <Slider
            value={threshold}
            minimumValue={1}
            maximumValue={100}
            step={1}
            minimumTrackTintColor="#8ab4ff"
            maximumTrackTintColor="#1b2534"
            thumbTintColor="#2d6df6"
            onValueChange={setThreshold}
          />
        </View>

        <Text style={styles.sectionTitle}>Alert channels</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Email alerts</Text>
            <Switch value={emailAlerts} onValueChange={setEmailAlerts} />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Push alerts</Text>
            <Switch value={pushAlerts} onValueChange={setPushAlerts} />
          </View>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>SMS alerts</Text>
              <Text style={styles.toggleHint}>Later</Text>
            </View>
            <Switch value={smsAlerts} onValueChange={setSmsAlerts} />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
        <Text style={styles.primaryButtonText}>Continue</Text>
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
  content: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f5f7fb',
  },
  subtitle: {
    color: '#b5c0d3',
    marginTop: 6,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#98a7c2',
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    padding: 16,
    gap: 12,
  },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#8aa0c6',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    color: '#e6ebf5',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleLabel: {
    color: '#e6ebf5',
    fontWeight: '500',
  },
  toggleHint: {
    color: '#7b8aa5',
    fontSize: 12,
    marginTop: 2,
  },
  primaryButton: {
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryButtonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
    marginTop: 10,
  },
});
