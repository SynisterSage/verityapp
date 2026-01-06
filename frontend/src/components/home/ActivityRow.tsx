import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getRiskStyles } from '../../utils/risk';

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
  const riskStyles = getRiskStyles(badgeLevel ?? badge);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.rowLeft}>
        <View style={styles.iconCircle}>
          <Ionicons name={ICONS[type]} size={18} color="#8ab4ff" />
        </View>
        <View>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.meta}>{new Date(createdAt).toLocaleString()}</Text>
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
        {badge}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: '#121a26',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#202c3c',
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
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#1b2634',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  label: {
    color: '#e4ebf7',
    fontWeight: '600',
  },
  meta: {
    color: '#8aa0c6',
    marginTop: 4,
    fontSize: 12,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    letterSpacing: 0.4,
  },
});
