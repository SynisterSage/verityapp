import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getRiskStyles } from '../../utils/risk';

type AlertCardProps = {
  alertType: string;
  status: string;
  createdAt: string;
  score?: number | string | null;
  riskLevel?: string | null;
  riskLabel?: string | null;
  subtitle?: string;
  onPress?: () => void;
};

export default function AlertCard({
  alertType,
  status,
  createdAt,
  score,
  riskLevel,
  riskLabel,
  subtitle,
  onPress,
}: AlertCardProps) {
  const badgeLabel = riskLabel ?? riskLevel ?? 'unknown';
  const riskStyles = getRiskStyles(riskLevel ?? badgeLabel);
  const scoreValue = score ?? '—';
  const scoreText = typeof scoreValue === 'number' ? scoreValue.toString() : scoreValue;
  const subtitleText = subtitle ?? `Score ${scoreText}`;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={!onPress}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Ionicons name="alert-circle" size={18} color="#8ab4ff" />
          </View>
          <View>
            <Text style={styles.title}>{alertType.toUpperCase()}</Text>
            <Text style={styles.subtitle}>{subtitleText}</Text>
          </View>
        </View>
        <Text
          style={[
            styles.badge,
            {
              backgroundColor: riskStyles.background,
              color: riskStyles.text,
              borderColor: riskStyles.accent,
            },
          ]}
        >
          {badgeLabel.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.meta}>
        {new Date(createdAt).toLocaleString()} • {status}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#121a26',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#1b2634',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  subtitle: {
    color: '#8aa0c6',
    marginTop: 4,
    fontSize: 12,
  },
  meta: {
    color: '#8aa0c6',
    marginTop: 10,
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
});
