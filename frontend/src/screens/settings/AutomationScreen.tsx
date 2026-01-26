import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { useProfile } from '../../context/ProfileContext';
import { authorizedFetch } from '../../services/backend';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import ActionFooter from '../../components/onboarding/ActionFooter';
import SettingsHeader from '../../components/common/SettingsHeader';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';

export default function AutomationScreen() {
  const insets = useSafeAreaInsets();
  const { activeProfile, canManageProfile, setActiveProfile } = useProfile();
  const [autoMarkEnabled, setAutoMarkEnabled] = useState(false);
  const [fraudThreshold, setFraudThreshold] = useState(90);
  const [safeThreshold, setSafeThreshold] = useState(30);
  const [autoTrustOnSafe, setAutoTrustOnSafe] = useState(false);
  const [autoBlockOnFraud, setAutoBlockOnFraud] = useState(true);
  const [saving, setSaving] = useState(false);
  const { theme } = useTheme();
  const styles = useMemo(() => createAutomationStyles(theme), [theme]);
  const sliderInactiveTrackColor = useMemo(
    () => withOpacity(theme.colors.textMuted, 0.25),
    [theme.colors.textMuted]
  );
  const switchInactiveTrackColor = useMemo(
    () => withOpacity(theme.colors.textMuted, 0.35),
    [theme.colors.textMuted]
  );

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

  const helperItems = useMemo(
    () => [
      {
        icon: 'speedometer',
        color: theme.colors.accent,
        text: 'Sliders set how strict Verity evaluates each call so you can keep the circle calm.',
      },
      {
        icon: 'shield-checkmark',
        color: theme.colors.success,
        text: 'Toggles decide whether to block suspicious calls or trust the gentle ones automatically.',
      },
    ],
    [theme.colors.accent, theme.colors.success]
  );

  const hasChanges = useMemo(() => {
    if (!activeProfile) return false;
    return (
      autoMarkEnabled !== Boolean(activeProfile.auto_mark_enabled) ||
      fraudThreshold !==
        (typeof activeProfile.auto_mark_fraud_threshold === 'number'
          ? activeProfile.auto_mark_fraud_threshold
          : typeof activeProfile.alert_threshold_score === 'number'
          ? activeProfile.alert_threshold_score
          : 90) ||
      safeThreshold !==
        (typeof activeProfile.auto_mark_safe_threshold === 'number'
          ? activeProfile.auto_mark_safe_threshold
          : 30) ||
      autoTrustOnSafe !== Boolean(activeProfile.auto_trust_on_safe) ||
      autoBlockOnFraud !== (activeProfile.auto_block_on_fraud === false ? false : true)
    );
  }, [
    activeProfile,
    autoMarkEnabled,
    autoBlockOnFraud,
    autoTrustOnSafe,
    fraudThreshold,
    safeThreshold,
  ]);

  if (!canManageProfile) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <SettingsHeader title="Automation" subtitle="Manage how calls update safelist" />
        <View style={styles.disabledContent}>
          <Text style={styles.disabledText}>Only caretakers can manage automation settings.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SettingsHeader title="Automation" subtitle="Tune how Verity reacts" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 24) + 180,
            paddingTop: Math.max(insets.top, 12) + 0,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >

        <View style={styles.card}>
          <View style={[styles.row, styles.rowTop]}>
            <View style={styles.rowText}>
              <Text style={styles.title}>Auto-label calls</Text>
              <Text style={[styles.subtitle, styles.subtitleSpaced]}>
                Let Verity filter each call for your loved one so you only get the alerts that matter.
              </Text>
            </View>
            <Switch
              value={autoMarkEnabled}
              onValueChange={setAutoMarkEnabled}
              trackColor={{ false: switchInactiveTrackColor, true: theme.colors.accent }}
              thumbColor={theme.colors.surface}
            />
          </View>

          <View style={styles.separator} />

          <View style={[styles.thresholdRow, !autoMarkEnabled && styles.disabled]}>
            <View style={styles.sliderHeader}>
              <Text style={styles.thresholdLabel}>Mark as fraud at: {fraudThreshold}</Text>
              <Text style={styles.sliderHint}>Higher = stricter filtering</Text>
            </View>
            <Slider
              value={fraudThreshold}
              onValueChange={setFraudThreshold}
              minimumValue={60}
              maximumValue={100}
              step={1}
              minimumTrackTintColor={theme.colors.accent}
              maximumTrackTintColor={sliderInactiveTrackColor}
              thumbTintColor={theme.colors.surface}
              disabled={!autoMarkEnabled}
            />
            <Text style={styles.helper}>Recommended: 85–95 for strict fraud catches.</Text>
          </View>

          <View style={[styles.thresholdRow, !autoMarkEnabled && styles.disabled]}>
            <View style={styles.sliderHeader}>
              <Text style={styles.thresholdLabel}>Mark as safe at: {safeThreshold}</Text>
              <Text style={styles.sliderHint}>Lower = more trust</Text>
            </View>
            <Slider
              value={safeThreshold}
              onValueChange={setSafeThreshold}
              minimumValue={0}
              maximumValue={60}
              step={1}
              minimumTrackTintColor={theme.colors.accent}
              maximumTrackTintColor={sliderInactiveTrackColor}
              thumbTintColor={theme.colors.surface}
              disabled={!autoMarkEnabled}
            />
            <Text style={styles.helper}>Recommended: 20–35 for clearly low-risk calls.</Text>
          </View>

          <View style={[styles.row, styles.toggleRow, !autoMarkEnabled && styles.disabled]}>
            <View style={styles.rowText}>
              <Text style={styles.title}>Block high-risk callers</Text>
              <Text style={styles.subtitle}>If auto-marked fraud, block the number.</Text>
            </View>
            <Switch
              value={autoBlockOnFraud}
              onValueChange={setAutoBlockOnFraud}
              trackColor={{ false: switchInactiveTrackColor, true: theme.colors.accent }}
              thumbColor={theme.colors.surface}
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
              trackColor={{ false: switchInactiveTrackColor, true: theme.colors.accent }}
              thumbColor={theme.colors.surface}
              disabled={!autoMarkEnabled}
            />
          </View>
        </View>

        <View style={styles.helperWrap}>
          <HowItWorksCard items={helperItems} />
        </View>
      </ScrollView>
      <ActionFooter
        primaryLabel="Save preferences"
        onPrimaryPress={save}
        primaryLoading={saving}
        primaryDisabled={!hasChanges || saving}
      />
    </SafeAreaView>
  );
}

const createAutomationStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    content: {
      paddingHorizontal: 24,
      paddingBottom: 28,
      paddingTop: 16,
      gap: 20,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 32,
      padding: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 16,
      shadowColor: theme.colors.border,
      shadowOpacity: 0.25,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 12 },
    },
    headerSection: {
      paddingHorizontal: 0,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    rowTop: {
      marginBottom: 6,
    },
    rowText: {
      flex: 1,
      gap: 4,
    },
    title: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    subtitleSpaced: {
      marginTop: 4,
    },
    thresholdRow: {
      gap: 10,
      marginBottom: 6,
    },
    sliderHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sliderHint: {
      color: theme.colors.textDim,
      fontSize: 12,
      fontWeight: '600',
    },
    thresholdLabel: {
      color: theme.colors.text,
      fontWeight: '600',
    },
    helper: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    toggleRow: {
      paddingTop: 8,
    },
    disabled: {
      opacity: 0.55,
    },
    disabledText: {
      color: theme.colors.textMuted,
    },
    separator: {
      height: 1,
      backgroundColor: theme.colors.border,
    },
    helperWrap: {
      paddingHorizontal: 4,
      marginTop: 12,
    },
    disabledContent: {
      paddingHorizontal: 24,
      marginTop: 24,
    },
  });
