import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
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
import HowItWorksCard from '../../components/onboarding/HowItWorksCard';
import SettingsHeader from '../../components/common/SettingsHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';
import { logError, logEvent } from '../../services/sentry';

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

type PreferenceKey =
  | 'trusted_activity'
  | 'circle_activity'
  | 'weekly_email';

type PreferenceItem = {
  key: PreferenceKey;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { activeProfile, setActiveProfile, canManageProfile } = useProfile();
  const { theme } = useTheme();
  const styles = useMemo(() => createNotificationStyles(theme), [theme]);

  const [threshold, setThreshold] = useState(activeProfile?.alert_threshold_score ?? 90);
  const [pushTrustedActivity, setPushTrustedActivity] = useState(
    activeProfile?.enable_push_trusted_activity ?? true
  );
  const [pushCircleActivity, setPushCircleActivity] = useState(
    activeProfile?.enable_push_circle_activity ?? true
  );
  const [weeklyEmailReports, setWeeklyEmailReports] = useState(
    activeProfile?.enable_email_weekly_reports ?? true
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [levelLabel, setLevelLabel] = useState(() => getLevelLabel(threshold));
  const [useLegacyAlertPrefsApi, setUseLegacyAlertPrefsApi] = useState(false);

  useEffect(() => {
    if (!activeProfile) return;
    setThreshold(activeProfile.alert_threshold_score ?? 90);
    setPushTrustedActivity(activeProfile.enable_push_trusted_activity ?? true);
    setPushCircleActivity(activeProfile.enable_push_circle_activity ?? true);
    setWeeklyEmailReports(activeProfile.enable_email_weekly_reports ?? true);
  }, [activeProfile]);

  useEffect(() => {
    const nextLabel = getLevelLabel(threshold);
    if (nextLabel !== levelLabel) {
      Haptics.selectionAsync().catch(() => null);
      setLevelLabel(nextLabel);
    }
  }, [threshold, levelLabel]);

  const pushItems = useMemo<PreferenceItem[]>(
    () => [
      {
        key: 'trusted_activity',
        title: 'Trusted call activity',
        description: 'Connected trusted callers and verified bridge updates',
        icon: 'shield-checkmark-outline',
        active: pushTrustedActivity,
      },
      {
        key: 'circle_activity',
        title: 'Circle activity',
        description: 'Member changes, safe phrases, blocks, and security actions',
        icon: 'people-outline',
        active: pushCircleActivity,
      },
    ],
    [pushCircleActivity, pushTrustedActivity]
  );

  const emailItems = useMemo<PreferenceItem[]>(
    () => [
      {
        key: 'weekly_email',
        title: 'Weekly summary email',
        description: 'Owner and admins get one weekly account summary',
        icon: 'mail-outline',
        active: weeklyEmailReports,
      },
    ],
    [weeklyEmailReports]
  );

  const handleToggle = useCallback((key: PreferenceKey) => {
    if (key === 'trusted_activity') {
      setPushTrustedActivity((prev) => !prev);
      return;
    }
    if (key === 'circle_activity') {
      setPushCircleActivity((prev) => !prev);
      return;
    }
    setWeeklyEmailReports((prev) => !prev);
  }, []);

  const hasChanges = useMemo(() => {
    if (!activeProfile) return false;

    const thresholdChanged = threshold !== (activeProfile.alert_threshold_score ?? 90);
    const trustedChanged =
      pushTrustedActivity !== (activeProfile.enable_push_trusted_activity ?? true);
    const circleChanged =
      pushCircleActivity !== (activeProfile.enable_push_circle_activity ?? true);
    const emailChanged =
      weeklyEmailReports !== (activeProfile.enable_email_weekly_reports ?? true);

    return canManageProfile
      ? thresholdChanged || trustedChanged || circleChanged || emailChanged
      : thresholdChanged || trustedChanged || circleChanged;
  }, [
    activeProfile,
    canManageProfile,
    pushCircleActivity,
    pushTrustedActivity,
    threshold,
    weeklyEmailReports,
  ]);

  const savePrefs = async () => {
    if (!activeProfile) return;
    setError('');
    Keyboard.dismiss();
    setSaving(true);

    try {
      const roundedThreshold = Math.round(threshold);
      const body: Record<string, number | boolean> = {
        alert_threshold_score: roundedThreshold,
        enable_push_alerts: true,
        enable_push_trusted_activity: pushTrustedActivity,
        enable_push_circle_activity: pushCircleActivity,
      };

      if (canManageProfile) {
        body.enable_email_weekly_reports = weeklyEmailReports;
      }

      const legacyBody: Record<string, number | boolean> = {
        alert_threshold_score: roundedThreshold,
        enable_push_alerts: true,
      };
      if (canManageProfile) {
        legacyBody.enable_email_alerts = weeklyEmailReports;
      }

      let data: any;
      if (useLegacyAlertPrefsApi) {
        data = await authorizedFetch(`/profiles/${activeProfile.id}/alerts`, {
          method: 'PATCH',
          body: JSON.stringify(legacyBody),
        });
      } else {
        try {
          data = await authorizedFetch(`/profiles/${activeProfile.id}/alerts`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
        } catch (err) {
          if (!isLegacyAlertPrefsError(err)) {
            throw err;
          }
          setUseLegacyAlertPrefsApi(true);
          data = await authorizedFetch(`/profiles/${activeProfile.id}/alerts`, {
            method: 'PATCH',
            body: JSON.stringify(legacyBody),
          });
        }
      }

      const mergedProfile = {
        ...(data?.profile ?? activeProfile),
        alert_threshold_score: roundedThreshold,
        enable_push_alerts: true,
        enable_push_trusted_activity: pushTrustedActivity,
        enable_push_circle_activity: pushCircleActivity,
        enable_email_weekly_reports: canManageProfile
          ? weeklyEmailReports
          : activeProfile.enable_email_weekly_reports,
        enable_email_alerts: canManageProfile
          ? weeklyEmailReports
          : (data?.profile ?? activeProfile).enable_email_alerts,
      };
      setActiveProfile(mergedProfile);

      logEvent('notification_preferences_changed', {
        screen: 'Notifications',
        extra: {
          threshold: roundedThreshold,
          pushTrustedActivity,
          pushCircleActivity,
          weeklyEmailReports: canManageProfile ? weeklyEmailReports : undefined,
        },
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to update preferences.');
      logError(err, {
        screen: 'Notifications',
        extra: { reason: err?.message || 'Failed to update preferences.' },
      });
    } finally {
      setSaving(false);
    }
  };

  const helperItems = useMemo(
    () => [
      {
        icon: 'notifications-outline',
        color: theme.colors.danger,
        text: 'Turn on only the alert types you want to receive.',
      },
      {
        icon: 'settings',
        color: theme.colors.accent,
        text: 'Use the toggles to reduce non-critical activity updates.',
      },
    ],
    [theme.colors.accent, theme.colors.danger]
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SettingsHeader
        title="Notifications"
        subtitle="Choose how much activity you want to receive"
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 32) + 120,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <Text style={styles.title}>Alert Delivery</Text>
          <Text style={styles.subtitle}>
            Control which alerts reach you and how strict call screening should be.
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
            maximumTrackTintColor={withOpacity(theme.colors.text, 0.15)}
            thumbTintColor={theme.colors.accent}
            onValueChange={setThreshold}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>Lower</Text>
            <Text style={styles.sliderLabel}>Higher</Text>
          </View>
        </View>

        <View style={styles.notificationsSection}>
          <Text style={styles.sectionTitle}>Push Updates</Text>
          {pushItems.map((item) => (
            <PreferenceToggleRow
              key={item.key}
              item={item}
              onPress={() => handleToggle(item.key)}
              styles={styles}
              theme={theme}
            />
          ))}
        </View>

        {canManageProfile ? (
          <View style={styles.notificationsSection}>
            <Text style={styles.sectionTitle}>Email Summary</Text>
            {emailItems.map((item) => (
              <PreferenceToggleRow
                key={item.key}
                item={item}
                onPress={() => handleToggle(item.key)}
                styles={styles}
                theme={theme}
              />
            ))}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <HowItWorksCard caption="HOW IT WORKS" items={helperItems} />
      </ScrollView>

      <ActionFooter
        primaryLabel="Save preferences"
        onPrimaryPress={savePrefs}
        primaryLoading={saving}
        primaryDisabled={!hasChanges || saving}
      />
    </SafeAreaView>
  );
}

function PreferenceToggleRow({
  item,
  onPress,
  styles,
  theme,
}: {
  item: PreferenceItem;
  onPress: () => void;
  styles: ReturnType<typeof createNotificationStyles>;
  theme: AppTheme;
}) {
  return (
    <View style={styles.notificationRow}>
      <View style={styles.iconBox}>
        <Ionicons name={item.icon} size={20} color={theme.colors.accent} />
      </View>
      <View style={styles.notificationText}>
        <Text style={styles.notificationTitle}>{item.title}</Text>
        <Text style={styles.notificationSubtitle}>{item.description}</Text>
      </View>
      <TouchableOpacity
        style={[
          styles.toggle,
          item.active ? styles.toggleActive : styles.toggleInactive,
        ]}
        onPress={onPress}
      >
        <View
          style={[
            styles.toggleThumb,
            item.active ? styles.toggleThumbActive : styles.toggleThumbInactive,
          ]}
        />
      </TouchableOpacity>
    </View>
  );
}

function getLevelLabel(value: number) {
  if (value <= LEVELS[0].breakpoint) return LEVELS[0].label;
  if (value <= LEVELS[1].breakpoint) return LEVELS[1].label;
  return LEVELS[2].label;
}

const createNotificationStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    content: {
      paddingHorizontal: 28,
      paddingTop: 28,
      gap: 22,
    },
    headerSection: {
      marginBottom: 10,
    },
    title: {
      fontSize: 32,
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
      borderRadius: 32,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginTop: 2,
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
      color: withOpacity(theme.colors.text, 0.65),
      fontWeight: '600',
    },
    notificationsSection: {
      gap: 12,
      marginTop: 2,
    },
    sectionTitle: {
      fontSize: 11,
      letterSpacing: 1.8,
      color: theme.colors.textMuted,
      fontWeight: '700',
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    notificationRow: {
      minHeight: 90,
      borderRadius: 28,
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
