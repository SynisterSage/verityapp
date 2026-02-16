import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';

import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';

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
  const styles = useMemo(() => createAlertCardStyles(theme), [theme]);
  const accentColor = iconColor ?? theme.colors.accent;
  const iconBg = iconBackgroundColor ?? withOpacity(accentColor, 0.18);
  const scoreBackground = scoreBackgroundColor ?? withOpacity(accentColor, 0.15);
  const scoreTextColor = scoreColor ?? accentColor;
  const mutedStyle = muted ? { opacity: 0.7 } : null;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        mutedStyle,
      ]}
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      disabled={!onPress && !onLongPress}
    >
      <View style={styles.content}>
        <View style={[styles.iconWrapper, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName} size={20} color={accentColor} />
        </View>
        <View style={styles.textContent}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {description ? (
            <Text style={[styles.description, { color: theme.colors.textMuted }]} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
          <Text style={[styles.timestamp, { color: theme.colors.textDim }]} numberOfLines={1}>
            {timestamp}
          </Text>
        </View>
        {scoreLabel ? (
          <View style={[styles.scorePill, { backgroundColor: scoreBackground }]}>
            <Text style={[styles.scoreText, { color: scoreTextColor }]}>{scoreLabel}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const createAlertCardStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      borderRadius: 32,
      padding: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withOpacity(theme.colors.text, 0.1),
      marginBottom: 12,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    iconWrapper: {
      width: 44,
      height: 44,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    textContent: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0,
    },
    description: {
      fontSize: 13,
      fontWeight: '400',
      lineHeight: 18,
    },
    timestamp: {
      fontSize: 14,
      fontWeight: '400',
    },
    scorePill: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 999,
    },
    scoreText: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  });
