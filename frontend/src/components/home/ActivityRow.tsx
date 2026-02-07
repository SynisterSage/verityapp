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
  muted?: boolean;
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
  muted = false,
  onPress,
}: ActivityRowProps) {
  const { theme } = useTheme();
  const riskStyles = getRiskStyles(badgeLevel ?? badge);
  const mutedAccent = theme.colors.textDim;
  const mutedBackground = withOpacity(theme.colors.text, 0.08);
  const badgeBackground = muted ? mutedBackground : riskStyles.background;
  const badgeTextColor = muted ? mutedAccent : riskStyles.accent;
  const iconBg = muted ? mutedBackground : withOpacity(riskStyles.accent, 0.12);
  const iconColor = muted ? mutedAccent : riskStyles.accent;
  const labelColor = muted ? theme.colors.textMuted : theme.colors.text;
  const metaColor = muted ? theme.colors.textDim : theme.colors.textMuted;
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
          <Ionicons name={ICONS[type]} size={18} color={iconColor} />
        </View>
        <View style={styles.metaGroup}>
          <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
            {formattedLabel}
          </Text>
          <Text style={[styles.meta, { color: metaColor }]} numberOfLines={1}>
            {formatTimestamp(createdAt)}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.badge,
          {
            backgroundColor: badgeBackground,
          },
        ]}
      >
        <Text style={[styles.badgeText, { color: badgeTextColor }]}>{badge}</Text>
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
