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
import { formatPhoneNumber } from '../../utils/formatPhoneNumber';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TrustedCallDetail'>;

type TrustedAlertPayload = {
  callerNumber?: string | null;
  contactName?: string | null;
  toNumber?: string | null;
  bridged?: boolean;
};

type AlertRow = {
  id: string;
  created_at: string;
  payload: TrustedAlertPayload;
};

export default function TrustedCallDetailScreen({ route }: Props) {
  const { alertId } = route.params;
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [alert, setAlert] = useState<AlertRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('alerts')
      .select('id, created_at, payload')
      .eq('id', alertId)
      .maybeSingle();
    setAlert(data ?? null);
    setLoading(false);
  }, [alertId]);

  useEffect(() => {
    load();
  }, [load]);

  const styles = makeStyles(theme);

  const payload = alert?.payload ?? {};
  const callerNumber = payload.callerNumber ?? null;
  const contactName = payload.contactName ?? null;
  const toNumber = payload.toNumber ?? null;

  const heroName = contactName || (callerNumber ? formatPhoneNumber(callerNumber, callerNumber) : 'Trusted contact');
  const heroSubNumber = contactName && callerNumber ? formatPhoneNumber(callerNumber, callerNumber) : null;
  const lineLabel = toNumber ? formatPhoneNumber(toNumber, toNumber) : null;

  const heroDate = alert
    ? new Date(alert.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const heroTime = alert
    ? new Date(alert.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  const heroMeta = [heroDate, heroTime].filter(Boolean).join(' • ');

  const containerPaddingTop = insets.top > 0 ? 0 : 12;
  const contentPaddingBottom = Math.max(insets.bottom, 32);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { paddingTop: containerPaddingTop }]} edges={[]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} style={styles.popupBackIcon} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Call Details</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero block — mirrors CallDetailScreen */}
        <View style={styles.heroBlock}>
          <Text style={styles.heroNumber}>{heroName}</Text>
          {heroSubNumber ? (
            <Text style={[styles.heroMetaText, { marginTop: 2 }]}>{heroSubNumber}</Text>
          ) : null}
          {heroMeta ? (
            <View style={styles.heroMeta}>
              <Ionicons name="time-outline" size={12} color={theme.colors.textMuted} />
              <Text style={styles.heroMetaText}>{heroMeta}</Text>
            </View>
          ) : null}
        </View>

        {/* Status section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Status</Text>
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.statusIconBox, { backgroundColor: withOpacity(theme.colors.accent, 0.14) }]}>
                <Ionicons name="shield-checkmark" size={22} color={theme.colors.accent} />
              </View>
              <View style={styles.statusText}>
                <Text style={styles.statusTitle}>Safely Connected</Text>
                <Text style={styles.statusSubtitle}>
                  This call was from someone in your trusted contacts list and was connected directly to you.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Details section */}
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
            {lineLabel ? (
              <View style={[styles.metaRow, styles.metaRowBorder]}>
                <Text style={styles.metaLabel}>Protected line</Text>
                <Text style={styles.metaValue}>{lineLabel}</Text>
              </View>
            ) : null}
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
    popupBackIcon: {
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
    heroBlock: {
      paddingTop: 12,
      paddingBottom: 18,
    },
    heroNumber: {
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
      letterSpacing: 0.1,
      fontSize: 12,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 8,
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
    statusRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 16,
    },
    statusIconBox: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    statusText: {
      flex: 1,
      gap: 4,
    },
    statusTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    statusSubtitle: {
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
  });

