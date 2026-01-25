import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../context/ThemeContext';
import { getRiskStyles } from '../../utils/risk';
import { formatTimestamp } from '../../utils/formatTimestamp';
import { withOpacity } from '../../utils/color';

type RecentCallCardProps = {
  title?: string;
  transcript?: string | null;
  createdAt?: string;
  fraudLevel?: string | null;
  badgeLabel?: string;
  subtitleLabel?: string;
  emptyText?: string;
  maxLength?: number;
  onPress: () => void;
  hideBadge?: boolean;
};

export default function RecentCallCard({
  title = 'Recent Call',
  transcript,
  createdAt,
  fraudLevel,
  badgeLabel,
  subtitleLabel,
  emptyText = 'No calls recorded yet',
  maxLength = 90,
  onPress,
  hideBadge = false,
}: RecentCallCardProps) {
  const { theme } = useTheme();
  const formattedCreatedAt = createdAt ? formatTimestamp(createdAt) : undefined;
  const riskStyles = getRiskStyles(fraudLevel);
  const statusAccent = theme.colors.danger;
  const badgeBackground = withOpacity(statusAccent, 0.25);
  const badgeTextColor = statusAccent;
  const badgeText = (badgeLabel ?? fraudLevel ?? 'unknown').toUpperCase();
  const body = transcript
    ? transcript.length > maxLength
      ? `${transcript.slice(0, Math.max(0, maxLength - 1))}…`
      : transcript
    : emptyText;
  const subtitleParts = [formattedCreatedAt, subtitleLabel].filter(Boolean);
  const subtitle = subtitleParts.join(' · ');
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    onPress();
  };

  const headerRowStyles = [styles.headerRow, hideBadge && styles.headerRowNoBadge];
  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: theme.colors.surface }]} onPress={handlePress} activeOpacity={0.85}>
      <View style={headerRowStyles}>
        <View style={styles.headerRowLeft}>
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Ionicons name="call" size={24} color={theme.colors.accent} />
          </View>
          <View style={styles.headerText}>
            <Text
              style={[styles.cardTitle, { color: theme.colors.text }]}
              numberOfLines={hideBadge ? 2 : 1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>
            {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text> : null}
          </View>
        </View>
        {!hideBadge && badgeText ? (
        <View
          style={[
            styles.topBadge,
            {
              backgroundColor: badgeBackground,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: badgeTextColor }]}>{badgeText}</Text>
        </View>
        ) : null}
      </View>
      <View style={[styles.transcriptBlock, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Text style={[styles.body, { color: theme.colors.text }]} numberOfLines={2} ellipsizeMode="tail">
          {body}
        </Text>
      </View>
      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: theme.colors.accent }]}>Review Call Record</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} style={styles.footerIcon} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingRight: 90,
    position: 'relative',
  },
  headerRowNoBadge: {
    paddingRight: 0,
  },
  headerRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontWeight: '600',
    fontSize: 20,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  topBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  transcriptBlock: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  body: {
    fontStyle: 'italic',
    fontSize: 16,
    lineHeight: 22,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerIcon: {
    marginLeft: 6,
    opacity: 0.3,
  },
});
