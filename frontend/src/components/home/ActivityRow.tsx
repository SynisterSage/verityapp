import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../context/ThemeContext';
import { getRiskStyles } from '../../utils/risk';
import { formatTimestamp } from '../../utils/formatTimestamp';
import { withOpacity } from '../../utils/color';
import { formatPhoneNumber } from '../../utils/formatPhoneNumber';

export type ActivityType = 'call' | 'alert';

type ActivityRowProps = {
  type: ActivityType;
  label: string;
  createdAt: string;
  badge: string;
  badgeLevel?: string;
  onPress: () => void;
};

const ICONS: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  call: 'call-outline',
  alert: 'alert-circle-outline',
};

export default function ActivityRow({
  type,
  label,
  createdAt,
  badge,
  badgeLevel,
  onPress,
}: ActivityRowProps) {
  const { theme } = useTheme();
  const riskStyles = getRiskStyles(badgeLevel ?? badge);
  const iconBg = withOpacity(riskStyles.accent, 0.12);
  const digitsOnly = label.replace(/\D/g, '');
  const shouldFormatPhone = digitsOnly.length >= 10 && !/[A-Za-z]/.test(label);
  const formattedLabel = shouldFormatPhone ? formatPhoneNumber(label, label) : label;
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    onPress();
  };
  return (
    <TouchableOpacity
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
          <Ionicons name={ICONS[type]} size={18} color={riskStyles.accent} />
        </View>
        <View style={styles.metaGroup}>
          <Text style={[styles.label, { color: theme.colors.text }]} numberOfLines={1}>
            {formattedLabel}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {formatTimestamp(createdAt)}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.badge,
          {
            backgroundColor: riskStyles.background,
          },
        ]}
      >
        <Text style={[styles.badgeText, { color: riskStyles.text }]}>{badge}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: 22,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  metaGroup: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
