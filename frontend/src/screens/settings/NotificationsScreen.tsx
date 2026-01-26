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

const LEVELS = [
  { label: 'Standard', breakpoint: 39 },
  { label: 'Strict', breakpoint: 74 },
  { label: 'Maximum', breakpoint: 100 },
];

type NotificationChannel = {
  key: 'phone' | 'email' | 'sms';
  title: string;
  description: string;
  icon: string;
  active: boolean;
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { activeProfile, setActiveProfile } = useProfile();
  const { theme } = useTheme();
  const styles = useMemo(() => createNotificationStyles(theme), [theme]);
  const [threshold, setThreshold] = useState(activeProfile?.alert_threshold_score ?? 90);
  const [emailAlerts, setEmailAlerts] = useState(activeProfile?.enable_email_alerts ?? true);
  const [pushAlerts, setPushAlerts] = useState(activeProfile?.enable_push_alerts ?? true);
  const [smsAlerts, setSmsAlerts] = useState(activeProfile?.enable_sms_alerts ?? false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [levelLabel, setLevelLabel] = useState(() => getLevelLabel(threshold));

  useEffect(() => {
    if (!activeProfile) return;
    setThreshold(activeProfile.alert_threshold_score ?? 90);
    setEmailAlerts(activeProfile.enable_email_alerts ?? true);
    setSmsAlerts(activeProfile.enable_sms_alerts ?? false);
    setPushAlerts(activeProfile.enable_push_alerts ?? true);
  }, [activeProfile]);

  useEffect(() => {
    const nextLabel = getLevelLabel(threshold);
    if (nextLabel !== levelLabel) {
      Haptics.selectionAsync();
      setLevelLabel(nextLabel);
    }
  }, [threshold, levelLabel]);

  const notificationChannels = useMemo<NotificationChannel[]>(() => {
    return [
      {
        key: 'phone',
        title: 'Phone alerts',
        description: 'Instant notifications',
        icon: 'notifications-outline',
        active: pushAlerts,
      },
      {
        key: 'email',
        title: 'Email reports',
        description: 'Daily summaries',
        icon: 'mail-outline',
        active: emailAlerts,
      },
      {
        key: 'sms',
        title: 'SMS alerts',
        description: 'Delivered when we detect urgent risk',
        icon: 'chatbubble-ellipses-outline',
        active: smsAlerts,
      },
    ];
  }, [emailAlerts, pushAlerts, smsAlerts]);

  const handleToggle = useCallback((key: NotificationChannel['key']) => {
    if (key === 'email') {
      setEmailAlerts((prev) => !prev);
    } else if (key === 'phone') {
      setPushAlerts((prev) => !prev);
    } else if (key === 'sms') {
      setSmsAlerts((prev) => !prev);
    }
  }, []);

  const hasChanges = useMemo(() => {
    if (!activeProfile) return false;
    return (
      threshold !== (activeProfile.alert_threshold_score ?? 90) ||
      emailAlerts !== (activeProfile.enable_email_alerts ?? true) ||
      smsAlerts !== (activeProfile.enable_sms_alerts ?? false) ||
      pushAlerts !== (activeProfile.enable_push_alerts ?? true)
    );
  }, [activeProfile, threshold, emailAlerts, smsAlerts, pushAlerts]);

  const savePrefs = async () => {
    if (!activeProfile) return;
    setError('');
    Keyboard.dismiss();
    setSaving(true);
    try {
      const roundedThreshold = Math.round(threshold);
      const data = await authorizedFetch(`/profiles/${activeProfile.id}/alerts`, {
        method: 'PATCH',
        body: JSON.stringify({
          alert_threshold_score: roundedThreshold,
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

  const helperItems = useMemo(
    () => [
      {
        icon: 'speedometer',
        color: theme.colors.success,
        text: 'Higher settings stop more suspicious calls before your phone rings.',
      },
      {
        icon: 'notifications-outline',
        color: theme.colors.accent,
        text: 'Choose which alerts your trusted circle receives.',
      },
    ],
    [theme.colors.accent, theme.colors.success]
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SettingsHeader title="Notifications" subtitle="Manage how we alert you" />
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
          <Text style={styles.title}>Safety Level</Text>
          <Text style={styles.subtitle}>
            Choose how strictly Verity filters your calls and how we notify your circle.
          </Text>
        </View>

        <View style={styles.sensitivityCard}>
          <View style={styles.sensitivityHeader}>
            <Text style={styles.sensitivityLabel}>SENSITIVITY</Text>
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
            thumbTintColor={theme.colors.surface}
            onValueChange={setThreshold}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>Lower</Text>
            <Text style={styles.sliderLabel}>Higher</Text>
          </View>
        </View>

        <View style={styles.notificationsSection}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          {notificationChannels.map((channel) => (
            <View
              key={channel.key}
              style={[
                styles.notificationRow,
                channel.active ? styles.notificationRowActive : styles.notificationRowInactive,
              ]}
            >
              <View
                style={[
                  styles.iconBox,
                  channel.active ? styles.iconBoxActive : styles.iconBoxInactive,
                ]}
              >
                <Ionicons
                  name={channel.icon as any}
                  size={20}
                  color={channel.active ? theme.colors.surface : theme.colors.textMuted}
                />
              </View>
              <View style={styles.notificationText}>
                <Text
                  style={[
                    styles.notificationTitle,
                    channel.active && styles.notificationTitleActive,
                  ]}
                >
                  {channel.title}
                </Text>
                <Text style={styles.notificationSubtitle}>{channel.description}</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  channel.active ? styles.toggleActive : styles.toggleInactive,
                ]}
                onPress={() => handleToggle(channel.key)}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    channel.active ? styles.toggleThumbActive : styles.toggleThumbInactive,
                  ]}
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>

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
      gap: 24,
    },
    headerSection: {
      marginBottom: 16,
    },
    title: {
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: -0.35,
      color: theme.colors.text,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 17,
      fontWeight: '500',
      color: theme.colors.textMuted,
    },
    sensitivityCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 40,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      elevation: 5,
    },
    sensitivityHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sensitivityLabel: {
      fontSize: 10,
      letterSpacing: 1.5,
      fontWeight: '900',
      color: theme.colors.textMuted,
    },
    sensitivityValue: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    slider: {
      width: '100%',
      height: 40,
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
    },
    sectionTitle: {
      fontSize: 11,
      letterSpacing: 2,
      color: theme.colors.textMuted,
      fontWeight: '700',
      marginBottom: 8,
    },
    notificationRow: {
      height: 92,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    notificationRowActive: {
      borderColor: theme.colors.accent,
      backgroundColor: withOpacity(theme.colors.accent, 0.12),
    },
    notificationRowInactive: {
      backgroundColor: theme.colors.surfaceAlt,
    },
    iconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    iconBoxActive: {
      backgroundColor: theme.colors.accent,
    },
    iconBoxInactive: {
      backgroundColor: theme.colors.surfaceAlt,
    },
    notificationText: {
      flex: 1,
    },
    notificationTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.text,
    },
    notificationTitleActive: {
      color: theme.colors.text,
    },
    notificationSubtitle: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textMuted,
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
      marginTop: 12,
    },
  });
