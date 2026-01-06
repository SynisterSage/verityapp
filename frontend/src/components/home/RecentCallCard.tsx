import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getRiskStyles } from '../../utils/risk';

type RecentCallCardProps = {
  title?: string;
  transcript?: string | null;
  createdAt?: string;
  fraudLevel?: string | null;
  badgeLabel?: string;
  emptyText?: string;
  maxLength?: number;
  onPress: () => void;
};

export default function RecentCallCard({
  title = 'Recent Call',
  transcript,
  createdAt,
  fraudLevel,
  badgeLabel,
  emptyText = 'No calls recorded yet',
  maxLength = 90,
  onPress,
}: RecentCallCardProps) {
  const riskStyles = getRiskStyles(fraudLevel);
  const badgeText = (badgeLabel ?? fraudLevel ?? 'unknown').toUpperCase();
  const body = transcript
    ? transcript.length > maxLength
      ? `${transcript.slice(0, Math.max(0, maxLength - 1))}…`
      : transcript
    : emptyText;
  return (
    <TouchableOpacity style={[styles.card, styles.recentCard]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="call" size={20} color="#8ab4ff" />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <View>
        <Text style={styles.body} numberOfLines={2} ellipsizeMode="tail">
          {body}
        </Text>
        {createdAt ? (
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{new Date(createdAt).toLocaleString()}</Text>
            <Text
              style={[
                styles.badge,
                styles.recentBadge,
                {
                  backgroundColor: riskStyles.background,
                  color: riskStyles.text,
                  borderColor: riskStyles.accent,
                },
              ]}
            >
              {badgeText}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#202c3c',
  },
  recentCard: {
    borderColor: '#202c3c',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: '#1b2634',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  cardTitle: {
    color: '#f5f7fb',
    fontWeight: '600',
    fontSize: 16,
  },
  body: {
    color: '#d9e0f3',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    color: '#7f90ab',
    fontSize: 12,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    letterSpacing: 0.4,
  },
  recentBadge: {
    alignSelf: 'flex-start',
  },
});
