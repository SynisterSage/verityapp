import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';

import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';

export type AlertsModeKey = 'needs' | 'history';

type ActiveStyle = {
  gradient: [string, string];
  shadowColor: string;
};

type AlertsModeFilterProps = {
  value: AlertsModeKey;
  onChange: (value: AlertsModeKey) => void;
  style?: StyleProp<ViewStyle>;
};

const OPTIONS: Array<{ key: AlertsModeKey; label: string }> = [
  { key: 'needs', label: 'Needs Attention' },
  { key: 'history', label: 'History' },
];

export default function AlertsModeFilter({ value, onChange, style }: AlertsModeFilterProps) {
  const { theme } = useTheme();
  const activeStyles = useMemo(
    () =>
      ({
        needs: {
          gradient: [theme.colors.accent, withOpacity(theme.colors.accent, 0.75)],
          shadowColor: theme.colors.accent,
        },
        history: {
          gradient: [theme.colors.textDim, withOpacity(theme.colors.textDim, 0.82)],
          shadowColor: theme.colors.textDim,
        },
      }) as Record<AlertsModeKey, ActiveStyle>,
    [theme.colors.accent, theme.colors.textDim]
  );

  const handlePress = (option: AlertsModeKey) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(option);
  };

  return (
    <View style={[styles.container, style, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.row}>
        {OPTIONS.map((option, index) => {
          const active = option.key === value;
          const activeStyle = activeStyles[option.key];
          const isLast = index === OPTIONS.length - 1;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => handlePress(option.key)}
              style={({ pressed }) => [
                styles.segment,
                !isLast && styles.segmentSpacing,
                { backgroundColor: theme.colors.surfaceAlt },
                active && styles.segmentActive,
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
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 6,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  segmentSpacing: {
    marginRight: 8,
  },
  segmentActive: {
    backgroundColor: 'transparent',
  },
  segmentPressed: {
    transform: [{ scale: 0.985 }],
  },
  label: {
    color: '#8aa0c6',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  labelActive: {
    color: '#fff',
  },
});
