import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { authorizedFetch } from '../../services/backend';
import { useProfile } from '../../context/ProfileContext';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';
import LiveFeaturesSection from '../../components/notifications/LiveFeaturesSection';

type NotificationPreset = 'simple' | 'detailed';

const LEVELS = [
  { label: 'Standard', breakpoint: 39 },
  { label: 'Strict', breakpoint: 74 },
  { label: 'Maximum', breakpoint: 100 },
];

function isLegacyAlertPrefsError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return (
    message.includes('Unrecognized keys') &&
    (message.includes('enable_push_trusted_activity') ||
      message.includes('enable_push_circle_activity') ||
      message.includes('enable_email_weekly_reports'))
  );
}

const PRESET_COPY: Record<
  NotificationPreset,
  { title: string; description: string; trusted: boolean; circle: boolean }
> = {
  simple: {
    title: 'Simple (Recommended)',
    description: 'Fewer updates, focused on what matters most.',
    trusted: false,
    circle: false,
  },
  detailed: {
    title: 'Detailed',
    description: 'All alert categories, including trusted and circle activity.',
    trusted: true,
    circle: true,
  },
};

export default function AlertPrefsScreen({ navigation }: { navigation: any }) {
  const { activeProfile, setActiveProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createAlertPrefsStyles(theme), [theme]);

  const [threshold, setThreshold] = useState(activeProfile?.alert_threshold_score ?? 90);
  const [pushTrustedActivity, setPushTrustedActivity] = useState(
    activeProfile?.enable_push_trusted_activity ?? false
  );
  const [pushCircleActivity, setPushCircleActivity] = useState(
    activeProfile?.enable_push_circle_activity ?? false
  );
  const [weeklyEmailReports, setWeeklyEmailReports] = useState(
    activeProfile?.enable_email_weekly_reports ?? true
  );
  const [preset, setPreset] = useState<NotificationPreset>(() =>
    derivePreset(activeProfile?.enable_push_trusted_activity, activeProfile?.enable_push_circle_activity)
  );
  const [error, setError] = useState('');
  const [levelLabel, setLevelLabel] = useState(() => getLevelLabel(threshold));
  const [useLegacyAlertPrefsApi, setUseLegacyAlertPrefsApi] = useState(false);

  useEffect(() => {
    if (!activeProfile) return;
    const trusted = activeProfile.enable_push_trusted_activity ?? false;
    const circle = activeProfile.enable_push_circle_activity ?? false;
    setThreshold(activeProfile.alert_threshold_score ?? 90);
    setPushTrustedActivity(trusted);
    setPushCircleActivity(circle);
    setWeeklyEmailReports(activeProfile.enable_email_weekly_reports ?? true);
    setPreset(derivePreset(trusted, circle));
  }, [activeProfile]);

  useEffect(() => {
    const nextLabel = getLevelLabel(threshold);
    if (nextLabel !== levelLabel) {
      Haptics.selectionAsync().catch(() => null);
      setLevelLabel(nextLabel);
    }
  }, [threshold, levelLabel]);

  const applyPreset = useCallback((nextPreset: NotificationPreset) => {
    const config = PRESET_COPY[nextPreset];
    setPreset(nextPreset);
    setPushTrustedActivity(config.trusted);
    setPushCircleActivity(config.circle);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
  }, []);

  const handleContinue = async () => {
    if (!activeProfile) return;
    setError('');

    const numericThreshold = Number(threshold);
    if (Number.isNaN(numericThreshold) || numericThreshold <= 0 || numericThreshold > 100) {
      setError('Threshold must be between 1 and 100.');
      return;
    }

    try {
      const roundedThreshold = Math.round(numericThreshold);
      const body = {
        alert_threshold_score: roundedThreshold,
        enable_push_alerts: true,
        enable_push_trusted_activity: pushTrustedActivity,
        enable_push_circle_activity: pushCircleActivity,
        enable_email_weekly_reports: weeklyEmailReports,
      };
      const legacyBody = {
        alert_threshold_score: roundedThreshold,
        enable_push_alerts: true,
        enable_email_alerts: weeklyEmailReports,
      };

      if (useLegacyAlertPrefsApi) {
        await authorizedFetch(`/profiles/${activeProfile.id}/alerts`, {
          method: 'PATCH',
          body: JSON.stringify(legacyBody),
        });
      } else {
        try {
          await authorizedFetch(`/profiles/${activeProfile.id}/alerts`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
        } catch (err) {
          if (!isLegacyAlertPrefsError(err)) {
            throw err;
          }
          setUseLegacyAlertPrefsApi(true);
          await authorizedFetch(`/profiles/${activeProfile.id}/alerts`, {
            method: 'PATCH',
            body: JSON.stringify(legacyBody),
          });
        }
      }

      setActiveProfile({
        ...activeProfile,
        alert_threshold_score: roundedThreshold,
        enable_push_alerts: true,
        enable_push_trusted_activity: pushTrustedActivity,
        enable_push_circle_activity: pushCircleActivity,
        enable_email_weekly_reports: weeklyEmailReports,
      });
      navigation.navigate('OnboardingCallForwarding');
    } catch (err: any) {
      setError(err?.message || 'Failed to update preferences.');
    }
  };

  const footerSecondary = () => navigation.navigate('OnboardingCallForwarding');

  const helperItems = useMemo(
    () => [
      {
        icon: 'notifications-outline',
        color: theme.colors.danger,
        text: 'Pick the alert categories you want to receive right now.',
      },
      {
        icon: 'options-outline',
        color: theme.colors.accent,
        text: 'Choose Simple or Detailed now. You can always adjust in Settings later.',
      },
    ],
    [theme.colors.accent, theme.colors.danger]
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <OnboardingHeader chapter="Security" activeStep={8} totalSteps={9} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 32) + 220,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>
            Set your safety style now. You can fine-tune this later in Settings.
          </Text>
        </View>

        <View style={styles.sensitivityCard}>
          <View style={styles.sensitivityHeader}>
            <Text style={styles.sensitivityLabel}>CALL SCREENING LEVEL</Text>
            <Text style={styles.sensitivityValue}>{levelLabel}</Text>
          </View>
          <Slider
            style={styles.slider}
            value={threshold}
            minimumValue={1}
            maximumValue={100}
            step={1}
            minimumTrackTintColor={theme.colors.accent}
            maximumTrackTintColor={withOpacity(theme.colors.textMuted, 0.25)}
            thumbTintColor={theme.colors.accent}
            onValueChange={setThreshold}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>Lower</Text>
            <Text style={styles.sliderLabel}>Higher</Text>
          </View>
        </View>

        <View style={styles.presetSection}>
          <Text style={styles.sectionTitle}>Notification style</Text>
          {(['simple', 'detailed'] as NotificationPreset[]).map((option) => {
            const isActive = preset === option;
            const config = PRESET_COPY[option];
            return (
              <Pressable
                key={option}
                onPress={() => applyPreset(option)}
                style={[
                  styles.presetCard,
                  isActive ? styles.presetCardActive : styles.presetCardInactive,
                ]}
              >
                <View style={styles.presetTextWrap}>
                  <Text style={styles.presetTitle}>{config.title}</Text>
                  <Text style={styles.presetDescription}>{config.description}</Text>
                </View>
                <Ionicons
                  name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={isActive ? theme.colors.accent : theme.colors.textMuted}
                />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.notificationsSection}>
          <Text style={styles.sectionTitle}>Push updates</Text>
          <View style={styles.notificationRow}>
            <View style={styles.iconBox}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={theme.colors.accent}
              />
            </View>
            <View style={styles.notificationText}>
              <Text style={styles.notificationTitle}>Trusted call activity</Text>
              <Text style={styles.notificationSubtitle}>Connected trusted callers and bridge updates.</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.toggle,
                pushTrustedActivity ? styles.toggleActive : styles.toggleInactive,
              ]}
              onPress={() => setPushTrustedActivity((prev) => !prev)}
            >
              <View
                style={[
                  styles.toggleThumb,
                  pushTrustedActivity ? styles.toggleThumbActive : styles.toggleThumbInactive,
                ]}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.notificationRow}>
            <View style={styles.iconBox}>
              <Ionicons
                name="people-outline"
                size={20}
                color={theme.colors.accent}
              />
            </View>
            <View style={styles.notificationText}>
              <Text style={styles.notificationTitle}>Circle activity</Text>
              <Text style={styles.notificationSubtitle}>Member and security updates.</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.toggle,
                pushCircleActivity ? styles.toggleActive : styles.toggleInactive,
              ]}
              onPress={() => setPushCircleActivity((prev) => !prev)}
            >
              <View
                style={[
                  styles.toggleThumb,
                  pushCircleActivity ? styles.toggleThumbActive : styles.toggleThumbInactive,
                ]}
              />
            </TouchableOpacity>
          </View>
        </View>

        <LiveFeaturesSection />

        <View style={styles.notificationsSection}>
          <Text style={styles.sectionTitle}>Email summary</Text>
          <View style={styles.notificationRow}>
            <View style={styles.iconBox}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={theme.colors.accent}
              />
            </View>
            <View style={styles.notificationText}>
              <Text style={styles.notificationTitle}>Weekly summary email</Text>
              <Text style={styles.notificationSubtitle}>
                Owner and admins receive one weekly summary report.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.toggle,
                weeklyEmailReports ? styles.toggleActive : styles.toggleInactive,
              ]}
              onPress={() => setWeeklyEmailReports((prev) => !prev)}
            >
              <View
                style={[
                  styles.toggleThumb,
                  weeklyEmailReports ? styles.toggleThumbActive : styles.toggleThumbInactive,
                ]}
              />
            </TouchableOpacity>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <HowItWorksCard caption="HOW IT WORKS" items={helperItems} />
      </ScrollView>

      <ActionFooter
        primaryLabel="Continue"
        onPrimaryPress={handleContinue}
        secondaryLabel="Skip for now"
        onSecondaryPress={footerSecondary}
      />
    </SafeAreaView>
  );
}

function derivePreset(trusted?: boolean | null, circle?: boolean | null): NotificationPreset {
  return trusted || circle ? 'detailed' : 'simple';
}

function getLevelLabel(value: number) {
  if (value <= LEVELS[0].breakpoint) return LEVELS[0].label;
  if (value <= LEVELS[1].breakpoint) return LEVELS[1].label;
  return LEVELS[2].label;
}

const createAlertPrefsStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 28,
      gap: 22,
    },
    headerSection: {
      marginBottom: 10,
    },
    title: {
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: -0.35,
      color: theme.colors.text,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 16,
      fontWeight: '500',
      color: theme.colors.textMuted,
    },
    sensitivityCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginTop: 4,
    },
    sensitivityHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    sensitivityLabel: {
      fontSize: 10,
      letterSpacing: 1.2,
      fontWeight: '800',
      color: theme.colors.textMuted,
    },
    sensitivityValue: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    slider: {
      width: '100%',
      height: 38,
    },
    sliderLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sliderLabel: {
      fontSize: 11,
      letterSpacing: 1,
      color: theme.colors.textDim,
      fontWeight: '600',
    },
    presetSection: {
      gap: 12,
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 12,
      letterSpacing: 0.6,
      color: theme.colors.textMuted,
      fontWeight: '600',
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    presetCard: {
      borderRadius: 24,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 84,
    },
    presetCardActive: {
      borderColor: theme.colors.accent,
      backgroundColor: withOpacity(theme.colors.accent, 0.12),
    },
    presetCardInactive: {
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    presetTextWrap: {
      flex: 1,
      paddingRight: 12,
    },
    presetTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    presetDescription: {
      marginTop: 3,
      fontSize: 12,
      color: theme.colors.textMuted,
      fontWeight: '600',
      lineHeight: 17,
    },
    notificationsSection: {
      gap: 12,
      marginTop: 4,
    },
    notificationRow: {
      minHeight: 84,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
    },
    notificationText: {
      flex: 1,
      paddingRight: 10,
    },
    notificationTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    notificationSubtitle: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    toggle: {
      width: 51,
      height: 31,
      borderRadius: 16,
      padding: 3,
      justifyContent: 'center',
    },
    toggleActive: {
      backgroundColor: theme.colors.accent,
    },
    toggleInactive: {
      backgroundColor: withOpacity(theme.colors.text, 0.1),
    },
    toggleThumb: {
      width: 25,
      height: 25,
      borderRadius: 12.5,
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
    error: {
      color: theme.colors.danger,
      marginTop: 8,
    },
  });
