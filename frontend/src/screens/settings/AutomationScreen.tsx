import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { useProfile } from '../../context/ProfileContext';
import { authorizedFetch } from '../../services/backend';

export default function AutomationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { activeProfile, canManageProfile, setActiveProfile } = useProfile();
  const [autoMarkEnabled, setAutoMarkEnabled] = useState(false);
  const [fraudThreshold, setFraudThreshold] = useState(90);
  const [safeThreshold, setSafeThreshold] = useState(30);
  const [autoTrustOnSafe, setAutoTrustOnSafe] = useState(false);
  const [autoBlockOnFraud, setAutoBlockOnFraud] = useState(true);
  const [saving, setSaving] = useState(false);

  const syncFromProfile = useCallback(() => {
    if (!activeProfile) {
      setAutoMarkEnabled(false);
      setFraudThreshold(90);
      setSafeThreshold(30);
      setAutoTrustOnSafe(false);
      setAutoBlockOnFraud(true);
      return;
    }
    setAutoMarkEnabled(Boolean(activeProfile.auto_mark_enabled));
    setFraudThreshold(
      typeof activeProfile.auto_mark_fraud_threshold === 'number'
        ? activeProfile.auto_mark_fraud_threshold
        : typeof activeProfile.alert_threshold_score === 'number'
        ? activeProfile.alert_threshold_score
        : 90
    );
    setSafeThreshold(
      typeof activeProfile.auto_mark_safe_threshold === 'number'
        ? activeProfile.auto_mark_safe_threshold
        : 30
    );
    setAutoTrustOnSafe(Boolean(activeProfile.auto_trust_on_safe));
    setAutoBlockOnFraud(
      activeProfile.auto_block_on_fraud === false ? false : true
    );
  }, [activeProfile]);

  useEffect(() => {
    syncFromProfile();
  }, [syncFromProfile]);

  const profileId = activeProfile?.id;

  const fetchActiveProfile = useCallback(async () => {
    if (!profileId) {
      return;
    }
    try {
      const data = await authorizedFetch(`/profiles/${profileId}`);
      if (data?.profile) {
        setActiveProfile(data.profile);
      }
    } catch (err) {
      console.error('Failed to fetch profile', err);
    }
  }, [profileId, setActiveProfile]);

  useFocusEffect(
    useCallback(() => {
      fetchActiveProfile();
    }, [fetchActiveProfile])
  );

  const save = async () => {
    if (!activeProfile) return;
    setSaving(true);
    try {
      const body = {
        auto_mark_enabled: autoMarkEnabled,
        auto_mark_fraud_threshold: Math.max(60, Math.min(100, Math.round(fraudThreshold))),
        auto_mark_safe_threshold: Math.max(0, Math.min(60, Math.round(safeThreshold))),
        auto_trust_on_safe: autoTrustOnSafe,
        auto_block_on_fraud: autoBlockOnFraud,
      };
      const data = await authorizedFetch(`/profiles/${activeProfile.id}/alerts`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (data?.profile) {
        setActiveProfile(data.profile);
      }
      Alert.alert('Saved', 'Automation preferences updated.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  if (!canManageProfile) {
    return (
      <SafeAreaView
        style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
        edges={[]}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#e4ebf7" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Automation</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.disabledText}>Only caretakers can manage automation settings.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#e4ebf7" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Automation</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowTop]}>
            <View style={styles.rowText}>
              <Text style={styles.title}>Auto-label calls</Text>
              <Text style={[styles.subtitle, styles.subtitleSpaced]}>
                Let Verity label calls for you. High scores go to fraud, low scores to safe.
              </Text>
            </View>
            <Switch
              value={autoMarkEnabled}
              onValueChange={setAutoMarkEnabled}
              trackColor={{ false: '#1f2a3a', true: '#2d6df6' }}
              thumbColor="#f5f7fb"
              style={styles.switchTop}
            />
          </View>

          <View style={styles.separator} />

          <View style={[styles.thresholdRow, !autoMarkEnabled && styles.disabled]}>
            <Text style={styles.thresholdLabel}>Mark as fraud at: {fraudThreshold}</Text>
            <Slider
              value={fraudThreshold}
              onValueChange={setFraudThreshold}
              minimumValue={60}
              maximumValue={100}
              step={1}
              minimumTrackTintColor="#2d6df6"
              maximumTrackTintColor="#283144"
              thumbTintColor="#8ab4ff"
              disabled={!autoMarkEnabled}
            />
            <Text style={styles.helper}>Recommended: 85–95 for strict fraud catches.</Text>
          </View>

          <View style={[styles.thresholdRow, !autoMarkEnabled && styles.disabled]}>
            <Text style={styles.thresholdLabel}>Mark as safe at: {safeThreshold}</Text>
            <Slider
              value={safeThreshold}
              onValueChange={setSafeThreshold}
              minimumValue={0}
              maximumValue={60}
              step={1}
              minimumTrackTintColor="#2d6df6"
              maximumTrackTintColor="#283144"
              thumbTintColor="#8ab4ff"
              disabled={!autoMarkEnabled}
            />
            <Text style={styles.helper}>Recommended: 20–35 for clearly low risk.</Text>
          </View>
          <View style={styles.separator} />

          <View style={[styles.row, styles.toggleRow, !autoMarkEnabled && styles.disabled]}>
            <View style={styles.rowText}>
              <Text style={styles.title}>Block high-risk callers</Text>
              <Text style={styles.subtitle}>If auto-marked fraud, block the number.</Text>
            </View>
            <Switch
              value={autoBlockOnFraud}
              onValueChange={setAutoBlockOnFraud}
              trackColor={{ false: '#1f2a3a', true: '#2d6df6' }}
              thumbColor="#f5f7fb"
              disabled={!autoMarkEnabled}
            />
          </View>

          <View style={[styles.row, styles.toggleRow, !autoMarkEnabled && styles.disabled]}>
            <View style={styles.rowText}>
              <Text style={styles.title}>Trust low-risk callers</Text>
              <Text style={styles.subtitle}>If auto-marked safe, add them to Trusted Contacts.</Text>
            </View>
            <Switch
              value={autoTrustOnSafe}
              onValueChange={setAutoTrustOnSafe}
              trackColor={{ false: '#1f2a3a', true: '#2d6df6' }}
              thumbColor="#f5f7fb"
              disabled={!autoMarkEnabled}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveDisabled]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save preferences'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#121a26',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f5f7fb',
  },
  content: {
    paddingBottom: 28,
    gap: 18,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#202c3c',
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowTop: {
    marginBottom: 2,
  },
  switchTop: {
    marginTop: 2,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: '#f5f7fb',
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9fb0cc',
    fontSize: 13,
    lineHeight: 18,
  },
  subtitleSpaced: {
    marginTop: 6,
  },
  thresholdRow: {
    gap: 8,
  },
  thresholdLabel: {
    color: '#c8d3ea',
    fontWeight: '600',
  },
  helper: {
    color: '#7f8aa3',
    fontSize: 12,
  },
  sectionLabel: {
    color: '#c8d3ea',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  toggleRow: {
    paddingTop: 4,
  },
  saveButton: {
    backgroundColor: '#2d6df6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#f5f7fb',
    fontWeight: '700',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.55,
  },
  disabledText: {
    color: '#8aa0c6',
  },
  separator: {
    height: 1,
    backgroundColor: '#1c2636',
    marginVertical: 6,
  },
});
