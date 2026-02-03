import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import {
  getAutoBlockManual,
  getAutoTrustManual,
  setAutoBlockManual,
  setAutoTrustManual,
} from '../../utils/blockTrustPrompt';
import type { AppTheme } from '../../theme/tokens';
import { logError, logEvent } from '../../services/sentry';

type AutomationToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  inactiveTrackColor: string;
  activeTrackColor: string;
};

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
  const [manualBlockEnabled, setManualBlockEnabled] = useState(false);
  const [manualTrustEnabled, setManualTrustEnabled] = useState(false);
  const [persistedManualBlock, setPersistedManualBlock] = useState(false);
  const [persistedManualTrust, setPersistedManualTrust] = useState(false);
  const AutomationToggle = ({
    value,
    onValueChange,
    disabled = false,
    inactiveTrackColor,
    activeTrackColor,
  }: AutomationToggleProps) => (
    <TouchableOpacity
      style={[
        styles.toggleButton,
        { backgroundColor: value ? activeTrackColor : inactiveTrackColor },
        disabled && styles.toggleDisabled,
      ]}
      onPress={() => {
        if (disabled) return;
        onValueChange(!value);
      }}
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.toggleThumb,
          value ? styles.toggleThumbActive : styles.toggleThumbInactive,
        ]}
      />
    </TouchableOpacity>
  );
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

  useEffect(() => {
      const loadManualPref = async () => {
        const blockPref = await getAutoBlockManual();
        const trustPref = await getAutoTrustManual();
        setManualBlockEnabled(blockPref);
        setManualTrustEnabled(trustPref);
        setPersistedManualBlock(blockPref);
        setPersistedManualTrust(trustPref);
      };
    void loadManualPref();
  }, []);

  const toggleManualBlock = useCallback((value: boolean) => {
    setManualBlockEnabled(value);
  }, []);

  const toggleManualTrust = useCallback((value: boolean) => {
    setManualTrustEnabled(value);
  }, []);

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
      await setAutoBlockManual(manualBlockEnabled);
      await setAutoTrustManual(manualTrustEnabled);
      setPersistedManualBlock(manualBlockEnabled);
      setPersistedManualTrust(manualTrustEnabled);
      Alert.alert('Saved', 'Automation preferences updated.');
      logEvent('automation_prefs_changed', {
        screen: 'Automation',
        extra: {
          autoMarkEnabled,
          fraudThreshold: Math.round(fraudThreshold),
          safeThreshold: Math.round(safeThreshold),
          autoTrustOnSafe,
          autoBlockOnFraud,
          manualBlockEnabled,
          manualTrustEnabled,
        },
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save preferences.');
      logError(err, {
        screen: 'Automation',
        extra: { reason: err?.message ?? 'Failed to save preferences.' },
      });
    } finally {
      setSaving(false);
    }
  };

  const helperItems = useMemo(
    () => [
      {
        icon: 'alert-circle',
        color: theme.colors.danger,
        text: 'Slide the fraud control to decide how easily Verity flags a caller.',
      },
      {
        icon: 'shield-checkmark',
        color: theme.colors.success,
        text: 'Toggle here to automatically block high-risk calls or trust gentle ones.',
      },
      {
        icon: 'checkmark-circle',
        color: theme.colors.accent,
        text: 'Press "Save preferences" when you are done so the changes stick.',
      },
    ],
    [theme.colors.accent, theme.colors.danger, theme.colors.success]
  );

  const hasChanges = useMemo(() => {
    const autoSettingsDiff =
      !activeProfile
        ? false
        : autoMarkEnabled !== Boolean(activeProfile.auto_mark_enabled) ||
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
          autoBlockOnFraud !==
            (activeProfile.auto_block_on_fraud === false ? false : true);
    const manualSettingsDiff =
      manualBlockEnabled !== persistedManualBlock ||
      manualTrustEnabled !== persistedManualTrust;
    return autoSettingsDiff || manualSettingsDiff;
  }, [
    activeProfile,
    autoMarkEnabled,
    autoBlockOnFraud,
    autoTrustOnSafe,
    fraudThreshold,
    safeThreshold,
    manualBlockEnabled,
    manualTrustEnabled,
    persistedManualBlock,
    persistedManualTrust,
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
            <Text style={[styles.subtitle, styles.subtitleSimple]}>
              Verity tags every incoming call so you only see alerts for what truly matters.
            </Text>
          </View>
            <AutomationToggle
              value={autoMarkEnabled}
              onValueChange={setAutoMarkEnabled}
              disabled={!canManageProfile}
              inactiveTrackColor={switchInactiveTrackColor}
              activeTrackColor={theme.colors.accent}
            />
          </View>

          <View style={styles.separator} />

          <View style={[styles.thresholdRow, !autoMarkEnabled && styles.disabled]}>
            <View style={styles.sliderHeader}>
              <Text style={styles.thresholdLabel}>Mark as fraud at: {fraudThreshold}</Text>
              <Text style={styles.sliderHint}>Move this slider right to catch more suspicious callers.</Text>
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
            <Text style={styles.helper}>Recommended range: 85–95 for strict fraud catches.</Text>
          </View>

          <View style={[styles.thresholdRow, !autoMarkEnabled && styles.disabled]}>
            <View style={styles.sliderHeader}>
              <Text style={styles.thresholdLabel}>Mark as safe at: {safeThreshold}</Text>
              <Text style={styles.sliderHint}>Move this slider left to trust harmless callers faster.</Text>
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
            <Text style={styles.helper}>Recommended range: 20–35 for clearly low-risk calls.</Text>
          </View>

          <View style={[styles.row, styles.toggleRow, !autoMarkEnabled && styles.disabled]}>
            <View style={styles.rowText}>
              <Text style={styles.title}>Block high-risk callers</Text>
              <Text style={styles.subtitle}>If auto-marked fraud, block the number.</Text>
            </View>
            <AutomationToggle
              value={autoBlockOnFraud}
              onValueChange={setAutoBlockOnFraud}
              disabled={!autoMarkEnabled}
              inactiveTrackColor={switchInactiveTrackColor}
              activeTrackColor={theme.colors.accent}
            />
          </View>

          <View style={[styles.row, styles.toggleRow, !autoMarkEnabled && styles.disabled]}>
            <View style={styles.rowText}>
              <Text style={styles.title}>Trust low-risk callers</Text>
              <Text style={styles.subtitle}>If auto-marked safe, add them to Trusted Contacts.</Text>
            </View>
            <AutomationToggle
              value={autoTrustOnSafe}
              onValueChange={setAutoTrustOnSafe}
              disabled={!autoMarkEnabled}
              inactiveTrackColor={switchInactiveTrackColor}
              activeTrackColor={theme.colors.accent}
            />
          </View>
        </View>

        <View style={styles.promptCard}>
          <Text style={styles.promptCardTitle}>Manual block/trust overrides</Text>
          <Text style={styles.promptCardBody}>
            When you mark a call as fraud or safe, these controls decide whether to auto-block or auto-trust the caller without showing the confirmation dialog.
          </Text>
          <View style={[styles.row, styles.toggleRow]}>
            <View style={styles.rowText}>
              <Text style={styles.title}>Block on fraud</Text>
              <Text style={styles.subtitle}>Automatically block the caller when you mark the call as fraud.</Text>
            </View>
            <AutomationToggle
              value={manualBlockEnabled}
              onValueChange={toggleManualBlock}
              inactiveTrackColor={switchInactiveTrackColor}
              activeTrackColor={theme.colors.accent}
            />
          </View>
          <View style={[styles.row, styles.toggleRow]}>
            <View style={styles.rowText}>
              <Text style={styles.title}>Trust on safe</Text>
              <Text style={styles.subtitle}>Automatically trust the caller when you mark the call as safe.</Text>
            </View>
            <AutomationToggle
              value={manualTrustEnabled}
              onValueChange={toggleManualTrust}
              inactiveTrackColor={switchInactiveTrackColor}
              activeTrackColor={theme.colors.accent}
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
    subtitleSimple: {
      marginTop: 4,
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
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 4,
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
    toggleButton: {
      width: 52,
      height: 32,
      borderRadius: 16,
      padding: 2,
      justifyContent: 'center',
    },
    toggleThumb: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
    },
    toggleThumbActive: {
      alignSelf: 'flex-end',
    },
    toggleThumbInactive: {
      alignSelf: 'flex-start',
    },
    toggleDisabled: {
      opacity: 0.6,
    },
    helperWrap: {
      paddingHorizontal: 4,
      marginTop: 12,
    },
    promptCard: {
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 20,
      marginTop: 18,
      backgroundColor: theme.colors.surface,
      gap: 12,
    },
    promptCardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
    },
    promptCardBody: {
      fontSize: 13,
      color: theme.colors.textMuted,
    },
    disabledContent: {
      paddingHorizontal: 24,
      marginTop: 24,
    },
  });
