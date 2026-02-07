import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';

type SupportButtonProps = {
  onPress: () => void;
  unreadCount?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export default function SupportButton({
  onPress,
  unreadCount = 0,
  accessibilityLabel,
  style,
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
      <View style={[styles.iconBox, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.colors.text} />
        {unreadCount > 0 && (
          <View style={[styles.badge, { backgroundColor: theme.colors.danger }]}>
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
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
