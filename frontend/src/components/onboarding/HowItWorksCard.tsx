import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';

export type HowItWorksItem = {
  icon: string;
  color?: string;
  text: string;
};

type Props = {
  caption?: string;
  items: HowItWorksItem[];
};

export default function HowItWorksCard({ caption = 'HOW IT WORKS', items }: Props) {
  const { theme } = useTheme();
  const defaultColor = theme.colors.accent;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.caption, { color: theme.colors.textMuted, fontFamily: theme.typography.fontFamily }]}>
        {caption}
      </Text>
      {items.map((item) => {
        const iconColor = item.color ?? defaultColor;
        return (
          <View key={item.text} style={styles.row}>
            <View
              style={[
                styles.icon,
                { backgroundColor: withOpacity(iconColor, 0.15) },
              ]}
            >
              <Ionicons name={item.icon as any} size={20} color={iconColor} />
            </View>
            <Text style={[styles.text, { color: theme.colors.text, fontFamily: theme.typography.fontFamily }]}>
              {item.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
    marginBottom: 20,
    marginTop: 5,
  },
  caption: {
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 12,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 14,
    flex: 1,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
});
