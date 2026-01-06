import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';

export default function AlertPrefsScreen({ navigation }: { navigation: any }) {
  const { activeProfile, setActiveProfile } = useProfile();
  const [threshold, setThreshold] = useState(
    String(activeProfile?.alert_threshold_score ?? 90)
  );
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
      navigation.navigate('OnboardingTestCall');
    } catch (err: any) {
      setError(err?.message || 'Failed to update preferences.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alert Preferences</Text>
      <Text style={styles.subtitle}>Tune when and how you get notified.</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Fraud threshold (1–100)</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={threshold}
          onChangeText={setThreshold}
        />
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Email alerts</Text>
        <Switch value={emailAlerts} onValueChange={setEmailAlerts} />
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Push alerts</Text>
        <Switch value={pushAlerts} onValueChange={setPushAlerts} />
      </View>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>SMS alerts (later)</Text>
        <Switch value={smsAlerts} onValueChange={setSmsAlerts} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

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
  section: {
    marginBottom: 18,
  },
  label: {
    color: '#c8d1e0',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#243247',
    borderRadius: 12,
    padding: 12,
    color: '#e6ebf5',
  },
  toggleRow: {
    backgroundColor: '#121a26',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202c3c',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggleLabel: {
    color: '#e6ebf5',
  },
  primaryButton: {
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
    marginBottom: 6,
  },
});
