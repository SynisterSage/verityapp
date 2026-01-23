import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../context/ThemeContext';

type StatTileProps = {
  label: string;
  value: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBackgroundColor?: string;
  onPress: () => void;
};

export default function StatTile({
  label,
  value,
  caption,
  icon,
  iconColor,
  iconBackgroundColor,
  onPress,
}: StatTileProps) {
  const { theme } = useTheme();
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    onPress();
  };
  return (
    <TouchableOpacity
      style={[
        styles.tile,
        {
          backgroundColor: theme.colors.surface,
          borderColor: 'rgba(255,255,255,0.08)',
        },
      ]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
        <View style={styles.topRow}>
          <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
          <View
            style={[
              styles.iconBox,
              {
                backgroundColor: iconBackgroundColor ?? theme.colors.surfaceAlt,
              },
            ]}
          >
            <Ionicons name={icon} size={18} color={iconColor ?? theme.colors.accent} />
          </View>
        </View>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <Text style={[styles.caption, { color: theme.colors.textMuted }]}>{caption}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 22,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: {
    fontSize: 32,
    fontWeight: '700',
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  caption: {
    marginTop: 4,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    opacity: 0.6,
  },
});
