import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';

type SupportButtonProps = {
  onPress: () => void;
  unreadCount?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  assistantOnline?: boolean;
  compact?: boolean;
};

export default function SupportButton({
  onPress,
  unreadCount = 0,
  accessibilityLabel,
  style,
  assistantOnline = false,
  compact = false,
}: SupportButtonProps) {
  const { theme } = useTheme();
  const countLabel = unreadCount > 9 ? '9+' : `${unreadCount}`;
  return (
    <Pressable
      style={[styles.touchArea, style]}
      onPress={onPress}
      android_ripple={{ color: withOpacity(theme.colors.text, 0.08) }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? 'Open support chat'}
    >
      <View style={[styles.iconBox, compact && styles.iconBoxCompact, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={compact ? 18 : 20}
          color={assistantOnline ? theme.colors.success : theme.colors.text}
        />
        {unreadCount > 0 && (
          <View style={[styles.badge, compact && styles.badgeCompact, { backgroundColor: theme.colors.danger }]}>
            <Text style={styles.badgeText}>{countLabel}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    padding: 4,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxCompact: {
    width: 40,
    height: 40,
    borderRadius: 14,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 4,
    minWidth: 20,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCompact: {
    minWidth: 18,
    height: 18,
    top: 1,
    right: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
