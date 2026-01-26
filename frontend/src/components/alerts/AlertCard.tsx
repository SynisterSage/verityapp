import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';

type AlertCardProps = {
  categoryLabel?: string;
  title: string;
  description?: string;
  timestamp: string;
  metaLabel?: string;
  scoreLabel?: string;
  scoreColor?: string;
  scoreBackgroundColor?: string;
  actionLabel?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  iconName?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBackgroundColor?: string;
  stripColor?: string;
  muted?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

export default function AlertCard({
  categoryLabel,
  title,
  description,
  timestamp,
  metaLabel,
  scoreLabel,
  scoreColor,
  scoreBackgroundColor,
  actionLabel,
  actionIcon = 'arrow-redo-outline',
  iconName = 'shield-checkmark-outline',
  iconColor,
  iconBackgroundColor,
  stripColor,
  muted,
  onPress,
  onLongPress,
}: AlertCardProps) {
  const { theme } = useTheme();
  const accentColor = iconColor ?? theme.colors.accent;
  const iconBg = iconBackgroundColor ?? withOpacity(accentColor, 0.16);
  const stripBg = stripColor ?? accentColor;
  const pillBackground = withOpacity(theme.colors.surface, 0.2);
  const scoreBackground = scoreBackgroundColor ?? pillBackground;
  const scoreTextColor = scoreColor ?? accentColor;
  const mutedStyle = muted ? { opacity: 0.75 } : null;
  const cardBackground = theme.colors.surface;
  const cardBorderColor = withOpacity(theme.colors.text, 0.1);
  const actionBackground = withOpacity(theme.colors.text, 0.08);
  const viewButtonBackground = withOpacity(theme.colors.text, 0.12);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: cardBackground, borderColor: cardBorderColor },
        mutedStyle,
      ]}
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress}
    >
      <View style={[styles.leftStrip, { backgroundColor: stripBg }]} />
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={[styles.iconWrapper, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={16} color={accentColor} />
          </View>
          <Text style={[styles.category, { color: theme.colors.textMuted }]}>
            {(categoryLabel ?? 'Alert').toUpperCase()}
          </Text>
          <View style={styles.headerSpacer} />
          <View style={styles.timeGroup}>
            <Ionicons name="time-outline" size={12} color={theme.colors.textDim} />
            <Text style={[styles.timestamp, { color: theme.colors.textDim }]}>{timestamp}</Text>
          </View>
        </View>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {scoreLabel ? (
            <View style={[styles.scoreBadge, { backgroundColor: scoreBackground }]}>
              <Text style={[styles.scoreText, { color: scoreTextColor }]}>{scoreLabel.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
        {description ? (
          <Text style={[styles.description, { color: theme.colors.textMuted }]} numberOfLines={3}>
            {description}
          </Text>
        ) : null}
        <View style={styles.footerRow}>
          <View style={[styles.metaContainer, { backgroundColor: withOpacity(theme.colors.surface, 0.12) }]}>
            <Text style={[styles.meta, { color: theme.colors.textDim }]} numberOfLines={1}>
              {metaLabel?.toUpperCase() ?? 'STATUS'}
            </Text>
          </View>
          {actionLabel ? (
            <View style={[styles.actionWrapper, { backgroundColor: 'transparent' }]}>
              <View style={[styles.actionButton, { backgroundColor: viewButtonBackground }]}>
                <Text style={[styles.actionButtonText, { color: accentColor }]}>{actionLabel.toUpperCase()}</Text>
                <Ionicons name={actionIcon} size={12} color={accentColor} style={styles.actionIcon} />
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    paddingVertical: 20,
    paddingRight: 24,
    paddingLeft: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    marginBottom: 16,
    overflow: 'hidden',
  },
  leftStrip: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderRadius: 999,
  },
  content: {
    marginLeft: 10,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  category: {
    fontSize: 14,
    letterSpacing: 0.2,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerSpacer: {
    flex: 1,
  },
  timestamp: {
    fontSize: 11,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  timeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.02,
    flex: 1,
  },
  scoreBadge: {
    paddingVertical: 2,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginLeft: 8,
  },
  scoreText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 10,
  },
  meta: {
    fontSize: 12,
    letterSpacing: 0.2,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
        left: 10,

  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginRight: 6,
  },
  actionIcon: {
    marginLeft: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginHorizontal: -8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  metaContainer: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  actionWrapper: {
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexShrink: 0,
  },
});
