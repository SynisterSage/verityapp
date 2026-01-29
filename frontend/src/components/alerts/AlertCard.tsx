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
  const pillBackground = scoreBackgroundColor ?? withOpacity(theme.colors.textDim, 0.12);
  const scoreBackground = pillBackground;
  const scoreTextColor = scoreColor ?? theme.colors.text;
  const mutedStyle = muted ? { opacity: 0.75 } : null;
  const cardBackground = theme.colors.surface;
  const cardBorderColor = withOpacity(theme.colors.text, 0.1);
  const metaBackground = theme.colors.surfaceAlt;
  const actionBackground = withOpacity(theme.colors.textDim, 0.15);
  const actionBorderColor = withOpacity(theme.colors.textDim, 0.3);

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
      <View style={styles.topRow}>
        <View style={[styles.iconWrapper, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName} size={16} color={accentColor} />
        </View>
        <View style={styles.topText}>
          <Text style={[styles.category, { color: theme.colors.textMuted }]}>
            {(categoryLabel ?? 'Alert').toUpperCase()}
          </Text>
          <Text style={[styles.timestamp, { color: theme.colors.textDim }]}>
            {timestamp}
          </Text>
        </View>
        {scoreLabel ? (
          <View style={[styles.scoreBadge, { backgroundColor: scoreBackground }]}>
            <Text style={[styles.scoreText, { color: scoreTextColor }]}>{scoreLabel.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      {description ? (
        <Text style={[styles.description, { color: theme.colors.textMuted }]} numberOfLines={2}>
          {description}
        </Text>
      ) : null}
      <View style={styles.footerRow}>
        <View style={[styles.metaBadge, { backgroundColor: metaBackground }]}>
          <Text style={[styles.meta, { color: theme.colors.textDim }]}>
            {metaLabel?.toUpperCase() ?? 'STATUS'}
          </Text>
        </View>
        {actionLabel ? (
          <View
            style={[
              styles.actionButton,
              { backgroundColor: actionBackground, borderColor: actionBorderColor },
            ]}
          >
            <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>
              {actionLabel.toUpperCase()}
            </Text>
            <Ionicons name={actionIcon} size={12} color={theme.colors.text} style={styles.actionIcon} />
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
    fontSize: 13,
    letterSpacing: 0.4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  timestamp: {
    fontSize: 12,
    marginTop: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  topText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.02,
  },
  scoreBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginLeft: 'auto',
  },
  scoreText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  description: {
    fontSize: 15,
    lineHeight: 20,
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  meta: {
    fontSize: 12,
    letterSpacing: 0.2,
    fontWeight: '600',
  },
  metaBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    gap: 6,
    borderWidth: 1,
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
});
