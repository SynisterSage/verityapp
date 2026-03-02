import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../services/supabase';
import { withOpacity } from '../../utils/color';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CircleActivityDetail'>;

type AlertRow = {
  id: string;
  created_at: string;
  alert_type: string;
  payload: Record<string, unknown>;
};

type EventMeta = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  eventLabel: string;
  whoLabel: (payload: Record<string, unknown>, actor: string) => string;
  whatHappened: (payload: Record<string, unknown>, actor: string) => string;
  whatItMeans: string;
};

function getEventMeta(alertType: string, accentColor: string, colors: {
  warning: string; danger: string; success: string; accent: string;
}): EventMeta {
  switch (alertType) {
    case 'safe_phrase_added':
      return {
        icon: 'chatbubble-ellipses-outline',
        iconColor: colors.success,
        eventLabel: 'Safe phrase added',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) =>
          p.phrase
            ? `${actor} added the phrase "${p.phrase}" to your safe list.`
            : `${actor} added a new safe phrase.`,
        whatItMeans:
          'A safe phrase is a word or sentence a caller can say to let you know it is really them. When a caller says this phrase during screening, you will see it highlighted so you can decide to pick up.',
      };
    case 'trusted_contact_added':
      return {
        icon: 'person-add-outline',
        iconColor: colors.accent,
        eventLabel: 'Trusted contact added',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) => {
          const count = typeof p.added === 'number' ? p.added : 1;
          return `${actor} added ${count} trusted contact${count !== 1 ? 's' : ''} to your line.`;
        },
        whatItMeans:
          'Trusted contacts skip screening entirely and ring your phone directly. Adding someone here means you have decided they should always get through without any questions.',
      };
    case 'blocked_caller_added':
      return {
        icon: 'ban-outline',
        iconColor: colors.danger,
        eventLabel: 'Number blocked',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) =>
          p.caller_number
            ? `${actor} blocked the number ${p.caller_number}.`
            : `${actor} blocked a caller.`,
        whatItMeans:
          'Blocked numbers can never reach your protected line. They will not hear it ring and will not be able to leave a message. The block stays in place until it is manually removed.',
      };
    case 'pin_change':
      return {
        icon: 'keypad-outline',
        iconColor: colors.warning,
        eventLabel: 'Safety PIN updated',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) => `${actor} changed the safety PIN for this profile.`,
        whatItMeans:
          'The safety PIN is used to verify identity when someone calls your line. Changing it means any caller who knew the old PIN will need the new one to get through.',
      };
    case 'security_password':
      return {
        icon: 'lock-closed-outline',
        iconColor: colors.warning,
        eventLabel: 'Password updated',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) => `${actor} changed the account password.`,
        whatItMeans:
          'The account password protects access to Verity Protect. If you did not make this change, go to Security in your settings and update it immediately.',
      };
    case 'member_joined':
      return {
        icon: 'people-outline',
        iconColor: colors.accent,
        eventLabel: 'Member joined',
        whoLabel: (p, actor) =>
          typeof p.member_display_name === 'string' ? p.member_display_name : actor,
        whatHappened: (p, actor) => {
          const name = typeof p.member_display_name === 'string' ? p.member_display_name : actor;
          return `${name} joined the circle.`;
        },
        whatItMeans:
          'Circle members can view activity on this profile. Their level of access depends on the role they were given when they were invited.',
      };
    case 'member_role_changed':
      return {
        icon: 'shield-outline',
        iconColor: colors.accent,
        eventLabel: 'Member role changed',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) => {
          const target = typeof p.target_display_name === 'string' ? p.target_display_name : 'a member';
          const role = typeof p.target_role === 'string' ? p.target_role : 'a new role';
          return `${actor} changed ${target}'s role to ${role}.`;
        },
        whatItMeans:
          'Roles control what a circle member can see and do. Caretakers can manage settings. Viewers can only see call activity.',
      };
    case 'member_removed':
      return {
        icon: 'person-remove-outline',
        iconColor: colors.danger,
        eventLabel: 'Member removed',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) => {
          const target = typeof p.target_display_name === 'string' ? p.target_display_name : 'a member';
          return `${actor} removed ${target} from the circle.`;
        },
        whatItMeans:
          'Removed members immediately lose access to this profile. They will no longer receive activity alerts and cannot view call history.',
      };
    case 'circle_invite':
      return {
        icon: 'mail-outline',
        iconColor: colors.accent,
        eventLabel: 'Invite sent',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) => `${actor} sent a circle invite link.`,
        whatItMeans:
          'An invite link was generated for someone to join this circle. The person who receives it can use it to create an account and connect to this profile.',
      };
    case 'automation_settings_updated':
      return {
        icon: 'settings-outline',
        iconColor: colors.accent,
        eventLabel: 'Automation updated',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) => {
          const changes = Array.isArray(p.changes) ? (p.changes as string[]) : [];
          return changes.length
            ? `${actor} updated automation: ${changes.join(', ')}.`
            : `${actor} updated automation settings.`;
        },
        whatItMeans:
          'Automation controls how your line handles calls automatically. For example, it can block callers after multiple failed screens, or update your safe list based on how calls go.',
      };
    case 'data_exported':
      return {
        icon: 'download-outline',
        iconColor: colors.warning,
        eventLabel: 'Data exported',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) => `${actor} exported the profile data.`,
        whatItMeans:
          'A copy of your call history and settings was downloaded. If you did not request this, check with your circle members to find out who did.',
      };
    case 'data_cleared':
      return {
        icon: 'trash-outline',
        iconColor: colors.danger,
        eventLabel: 'History cleared',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) => `${actor} cleared the call and alert history.`,
        whatItMeans:
          'All call records and alert history were permanently deleted. This cannot be undone. Your active settings like trusted contacts and safe phrases were not affected.',
      };
    default:
      return {
        icon: 'people-outline',
        iconColor: accentColor,
        eventLabel: 'Circle activity',
        whoLabel: (p, actor) => actor,
        whatHappened: (p, actor) => `${actor} made a change to this profile.`,
        whatItMeans: 'A member of your circle made a change. Tap the relevant settings screen to review the current state.',
      };
  }
}

export default function CircleActivityDetailScreen({ route }: Props) {
  const { alertId } = route.params;
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const styles = makeStyles(theme);

  const [alert, setAlert] = useState<AlertRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('alerts')
      .select('id, created_at, alert_type, payload')
      .eq('id', alertId)
      .maybeSingle();
    setAlert(data ?? null);
    setLoading(false);
  }, [alertId]);

  useEffect(() => { load(); }, [load]);

  const containerPaddingTop = Math.max(16, insets.top + 4);
  const contentPaddingBottom = Math.max(insets.bottom, 32);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { paddingTop: containerPaddingTop }]} edges={[]}>
        <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const payload = (alert?.payload ?? {}) as Record<string, unknown>;
  const alertType = alert?.alert_type ?? '';

  const actor =
    (typeof payload.actor_label === 'string' ? payload.actor_label : null) ??
    'Circle member';

  const meta = getEventMeta(alertType, theme.colors.accent, {
    warning: (theme.colors as Record<string, string>).warning ?? '#f59e0b',
    danger: theme.colors.danger,
    success: theme.colors.success,
    accent: theme.colors.accent,
  });

  const heroName = meta.whoLabel(payload, actor);
  const heroDate = alert
    ? new Date(alert.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const heroTime = alert
    ? new Date(alert.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  const heroMeta = [heroDate, heroTime].filter(Boolean).join(' • ');

  return (
    <SafeAreaView style={[styles.container, { paddingTop: containerPaddingTop }]} edges={[]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} style={styles.backIcon} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Circle Activity</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroBlock}>
          <Text style={styles.heroName}>{heroName}</Text>
          {heroMeta ? (
            <View style={styles.heroMeta}>
              <Ionicons name="time-outline" size={12} color={theme.colors.textMuted} />
              <Text style={styles.heroMetaText}>{heroMeta}</Text>
            </View>
          ) : null}
        </View>

        {/* Event card */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Event</Text>
          <View style={styles.card}>
            <View style={styles.eventRow}>
              <View style={[styles.eventIconBox, { backgroundColor: withOpacity(meta.iconColor, 0.13) }]}>
                <Ionicons name={meta.icon} size={22} color={meta.iconColor} />
              </View>
              <View style={styles.eventText}>
                <Text style={styles.eventTitle}>{meta.eventLabel}</Text>
                <Text style={styles.eventBody}>{meta.whatHappened(payload, actor)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Specific details — shown for types with structured payload data */}
        {(() => {
          const rows: { label: string; value: string }[] = [];

          if (alertType === 'safe_phrase_added' && typeof payload.phrase === 'string') {
            rows.push({ label: 'Phrase', value: `"${payload.phrase}"` });
          }

          if (alertType === 'blocked_caller_added') {
            if (typeof payload.caller_number === 'string') {
              rows.push({ label: 'Number blocked', value: payload.caller_number });
            }
            if (typeof payload.reason === 'string' && payload.reason.trim()) {
              rows.push({ label: 'Reason', value: payload.reason });
            }
          }

          if (alertType === 'trusted_contact_added') {
            const numbers = Array.isArray(payload.numbers) ? (payload.numbers as string[]) : [];
            numbers.forEach((n, i) => {
              rows.push({ label: i === 0 ? 'Number' + (numbers.length > 1 ? 's' : '') : '', value: n });
            });
          }

          if (alertType === 'circle_invite') {
            if (typeof payload.invite_email === 'string') {
              rows.push({ label: 'Invited', value: payload.invite_email });
            }
            if (typeof payload.invite_role === 'string') {
              rows.push({ label: 'Role', value: payload.invite_role.charAt(0).toUpperCase() + payload.invite_role.slice(1) });
            }
          }

          if (alertType === 'member_role_changed') {
            if (typeof payload.target_display_name === 'string') {
              rows.push({ label: 'Member', value: payload.target_display_name });
            }
            if (typeof payload.target_role === 'string') {
              rows.push({ label: 'New role', value: payload.target_role.charAt(0).toUpperCase() + payload.target_role.slice(1) });
            }
          }

          if (alertType === 'member_removed' && typeof payload.target_display_name === 'string') {
            rows.push({ label: 'Removed', value: payload.target_display_name });
          }

          if (alertType === 'automation_settings_updated') {
            const changes = Array.isArray(payload.changes) ? (payload.changes as string[]) : [];
            changes.forEach((c, i) => {
              rows.push({ label: i === 0 ? 'Changes' : '', value: c });
            });
          }

          if (rows.length === 0) return null;

          return (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Specific Details</Text>
              <View style={styles.card}>
                {rows.map((row, i) => (
                  <View key={i} style={[styles.metaRow, i > 0 && styles.metaRowBorder]}>
                    <Text style={styles.metaLabel}>{row.label}</Text>
                    <Text style={[styles.metaValue, styles.metaValueDetail]}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* Details card */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Details</Text>
          <View style={styles.card}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{heroDate}</Text>
            </View>
            <View style={[styles.metaRow, styles.metaRowBorder]}>
              <Text style={styles.metaLabel}>Time</Text>
              <Text style={styles.metaValue}>{heroTime}</Text>
            </View>
            <View style={[styles.metaRow, styles.metaRowBorder]}>
              <Text style={styles.metaLabel}>By</Text>
              <Text style={styles.metaValue}>{actor}</Text>
            </View>
          </View>
        </View>

        {/* What it means */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>What this means</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Ionicons name="information-circle-outline" size={18} color={theme.colors.textMuted} style={styles.infoIcon} />
              <Text style={styles.infoText}>{meta.whatItMeans}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: ReturnType<typeof import('../../context/ThemeContext').useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    header: {
      paddingHorizontal: 24,
      paddingTop: 0,
      paddingBottom: 22,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.1),
    },
    backIcon: {
      transform: [{ rotate: '-90deg' }],
    },
    headerContent: {
      flex: 1,
    },
    headerTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 8,
    },
    heroBlock: {
      paddingTop: 12,
      paddingBottom: 18,
    },
    heroName: {
      color: theme.colors.text,
      fontSize: 26,
      fontWeight: '600',
    },
    heroMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    heroMetaText: {
      color: theme.colors.textMuted,
      marginLeft: 6,
      fontSize: 12,
      letterSpacing: 0.1,
    },
    section: {
      marginBottom: 24,
    },
    sectionLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 32,
      padding: 24,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.08),
      overflow: 'hidden',
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 16,
    },
    eventIconBox: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    eventText: {
      flex: 1,
      gap: 4,
    },
    eventTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: '700',
    },
    eventBody: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4,
    },
    metaRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: withOpacity(theme.colors.text, 0.07),
      marginTop: 12,
      paddingTop: 12,
    },
    metaLabel: {
      color: theme.colors.textMuted,
      fontSize: 14,
    },
    metaValue: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '500',
    },
    metaValueDetail: {
      flex: 1,
      textAlign: 'right',
      marginLeft: 12,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    infoIcon: {
      marginTop: 1,
      flexShrink: 0,
    },
    infoText: {
      flex: 1,
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },
  });
