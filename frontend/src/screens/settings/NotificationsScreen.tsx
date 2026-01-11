import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Slider from '@react-native-community/slider';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { activeProfile, setActiveProfile } = useProfile();
  const [threshold, setThreshold] = useState(activeProfile?.alert_threshold_score ?? 90);
  const [emailAlerts, setEmailAlerts] = useState(activeProfile?.enable_email_alerts ?? true);
  const [smsAlerts, setSmsAlerts] = useState(activeProfile?.enable_sms_alerts ?? false);
  const [pushAlerts, setPushAlerts] = useState(activeProfile?.enable_push_alerts ?? true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeProfile) return;
    setThreshold(activeProfile.alert_threshold_score ?? 90);
    setEmailAlerts(activeProfile.enable_email_alerts ?? true);
    setSmsAlerts(activeProfile.enable_sms_alerts ?? false);
    setPushAlerts(activeProfile.enable_push_alerts ?? true);
  }, [activeProfile]);

  const hasChanges = useMemo(() => {
    if (!activeProfile) return false;
    return (
      threshold !== (activeProfile.alert_threshold_score ?? 90) ||
      emailAlerts !== (activeProfile.enable_email_alerts ?? true) ||
      smsAlerts !== (activeProfile.enable_sms_alerts ?? false) ||
      pushAlerts !== (activeProfile.enable_push_alerts ?? true)
    );
  }, [activeProfile, threshold, emailAlerts, smsAlerts, pushAlerts]);

  const profileId = activeProfile?.id;

  useFocusEffect(
    useCallback(() => {
      if (!profileId) {
        return;
      }
      let isActive = true;
      void (async () => {
        try {
          const data = await authorizedFetch(`/profiles/${profileId}`);
          if (isActive && data?.profile) {
            setActiveProfile(data.profile);
          }
        } catch (err) {
          console.error('Failed to refresh profile', err);
        }
      })();
      return () => {
        isActive = false;
      };
    }, [profileId, setActiveProfile])
  );

  const savePrefs = async () => {
    if (!activeProfile) return;
    setError('');
    Keyboard.dismiss();
    setSaving(true);
    try {
      const data = await authorizedFetch(`/profiles/${activeProfile.id}/alerts`, {
        method: 'PATCH',
        body: JSON.stringify({
          alert_threshold_score: threshold,
          enable_email_alerts: emailAlerts,
          enable_sms_alerts: smsAlerts,
          enable_push_alerts: pushAlerts,
        }),
      });
      if (data?.profile) {
        setActiveProfile(data.profile);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#e4ebf7" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>

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
        <TextInput
          style={styles.input}
          value={String(threshold)}
          onChangeText={(text) => {
            const numeric = Number(text);
            if (Number.isNaN(numeric)) return;
            setThreshold(Math.max(1, Math.min(100, numeric)));
          }}
          keyboardType="number-pad"
        />
      </View>

      <Text style={styles.sectionTitle}>Alert channels</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Email alerts</Text>
          <Switch value={emailAlerts} onValueChange={setEmailAlerts} />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>SMS alerts</Text>
          <Switch value={smsAlerts} onValueChange={setSmsAlerts} />
        </View>
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Push alerts</Text>
            <Text style={styles.toggleHint}>Coming soon</Text>
          </View>
          <Switch value={pushAlerts} onValueChange={setPushAlerts} />
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.saveButton, (!hasChanges || saving) && styles.saveDisabled]}
        onPress={savePrefs}
        disabled={!hasChanges || saving}
      >
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save preferences'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 0,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121a26',
    borderWidth: 1,
    borderColor: '#1f2a3a',
  },
  headerTitle: {
    color: '#f5f7fb',
    fontSize: 28,
    fontWeight: '700',
    marginLeft: 12,
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
  input: {
    borderWidth: 1,
    borderColor: '#243247',
    borderRadius: 12,
    padding: 10,
    color: '#e6ebf5',
    textAlign: 'center',
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
  saveButton: {
    marginTop: 18,
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  error: {
    color: '#ff8a8a',
    fontSize: 12,
    marginTop: 10,
  },
});
