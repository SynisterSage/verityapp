import {
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  Pressable,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';

import { withOpacity } from '../../utils/color';
import { useTheme } from '../../context/ThemeContext';

export const CALL_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'verified', label: 'Verified' },
  { key: 'risk', label: 'Risk' },
  { key: 'trusted', label: 'Trusted' },
  { key: 'handled', label: 'Handled' },
  { key: 'archived', label: 'Archived' },
] as const;

export type CallFilterKey = (typeof CALL_FILTER_OPTIONS)[number]['key'];

type ActiveStyle = {
  gradient: [string, string];
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
        },
        verified: {
          gradient: [theme.colors.success, withOpacity(theme.colors.success, 0.75)],
        },
        risk: {
          gradient: [theme.colors.danger, withOpacity(theme.colors.danger, 0.75)],
        },
        trusted: {
          gradient: [theme.colors.accent, withOpacity(theme.colors.accent, 0.75)],
        },
        handled: {
          gradient: [theme.colors.warning, withOpacity(theme.colors.warning, 0.75)],
        },
        archived: {
          gradient: [theme.colors.textDim, withOpacity(theme.colors.textDim, 0.82)],
        },
      }) as Record<CallFilterKey, ActiveStyle>,
    [theme.colors.accent, theme.colors.success, theme.colors.danger, theme.colors.warning, theme.colors.textDim]
  );

  const handlePress = (option: CallFilterKey) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(option);
  };

  return (
    <View style={[styles.container, style, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.scrollViewport}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {CALL_FILTER_OPTIONS.map((option, index) => {
            const active = option.key === value;
            const activeStyle = activeStyles[option.key];
            const isLast = index === CALL_FILTER_OPTIONS.length - 1;
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
                <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <LinearGradient
          pointerEvents="none"
          colors={[theme.colors.surface, withOpacity(theme.colors.surface, 0)]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.edgeFadeLeft}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[withOpacity(theme.colors.surface, 0), theme.colors.surface]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.edgeFadeRight}
        />
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
  scrollViewport: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  segment: {
    minWidth: 88,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  labelActive: {
    color: '#fff',
  },
  edgeFadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 16,
  },
  edgeFadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 16,
  },
});
