import { StyleProp, StyleSheet, Text, View, ViewStyle, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';

import { withOpacity } from '../../utils/color';
import { useTheme } from '../../context/ThemeContext';

export const CALL_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'verified', label: 'Verified' },
  { key: 'risk', label: 'Risk' },
] as const;

export type CallFilterKey = (typeof CALL_FILTER_OPTIONS)[number]['key'];

type ActiveStyle = {
  gradient: [string, string];
  shadowColor: string;
};

type CallFilterProps = {
  value: CallFilterKey;
  onChange: (value: CallFilterKey) => void;
  style?: StyleProp<ViewStyle>;
};

export default function CallFilter({ value, onChange, style }: CallFilterProps) {
  const { theme } = useTheme();
  const activeStyles = useMemo(
    () =>
      ({
        all: {
          gradient: [theme.colors.accent, withOpacity(theme.colors.accent, 0.75)],
          shadowColor: theme.colors.accent,
        },
        verified: {
          gradient: [theme.colors.success, withOpacity(theme.colors.success, 0.75)],
          shadowColor: theme.colors.success,
        },
        risk: {
          gradient: [theme.colors.danger, withOpacity(theme.colors.danger, 0.75)],
          shadowColor: theme.colors.danger,
        },
      }) as Record<CallFilterKey, ActiveStyle>,
    [theme]
  );

  const handlePress = (option: CallFilterKey) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(option);
  };

  return (
    <View style={[styles.container, style, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.row}>
        {CALL_FILTER_OPTIONS.map((option) => {
          const active = option.key === value;
          const activeStyle = activeStyles[option.key];
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => handlePress(option.key)}
              style={({ pressed }) => [
                styles.segment,
                { backgroundColor: theme.colors.surfaceAlt },
                active && styles.segmentActive,
                active && {
                  shadowColor: activeStyle.shadowColor,
                  shadowOpacity: 0.35,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 6,
                },
                pressed && styles.segmentPressed,
              ]}
            >
              {active && (
                <LinearGradient
                  colors={activeStyle.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 6,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  segment: {
    flex: 1,
    marginHorizontal: 4,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  segmentActive: {
    backgroundColor: 'transparent',
  },
  segmentPressed: {
    transform: [{ scale: 0.985 }],
  },
  label: {
    color: '#8aa0c6',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  labelActive: {
    color: '#fff',
  },
});
