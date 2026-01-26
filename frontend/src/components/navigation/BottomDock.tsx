import { Animated, View, TouchableOpacity, StyleSheet, Text, ViewStyle } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../context/ThemeContext';

const ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap; }> = {
  HomeTab: { active: 'home', inactive: 'home-outline' },
  CallsTab: { active: 'call', inactive: 'call-outline' },
  AlertsTab: { active: 'alert-circle', inactive: 'alert-circle-outline' },
  SettingsTab: { active: 'settings', inactive: 'settings-outline' },
};

type BottomDockProps = BottomTabBarProps & {
  containerStyle?: ViewStyle;
  dockHeight: number;
};

export default function BottomDock({
  state,
  descriptors,
  navigation,
  dockHeight,
  containerStyle,
}: BottomDockProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 16);
  const focusedRoute = state.routes[state.index];
  const nestedState = focusedRoute?.state as { index?: number } | undefined;
  if (nestedState && typeof nestedState.index === 'number' && nestedState.index > 0) {
    return null;
  }

  const scaleValuesRef = useRef<Animated.Value[]>([]);
  if (scaleValuesRef.current.length !== state.routes.length) {
    scaleValuesRef.current = state.routes.map(() => new Animated.Value(1));
  }

  useEffect(() => {
    scaleValuesRef.current.forEach((anim, idx) => {
      Animated.timing(anim, {
        toValue: state.index === idx ? 1.15 : 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [state.index, state.routes.length]);
  const containerBackground = theme.colors.surface;
  const borderColor = theme.colors.border;
  const labelColor = theme.colors.textMuted;
  const labelActiveColor = theme.colors.text;

  return (
    <View
      style={[
        styles.container,
        {
          height: 96 + bottomPadding,
          paddingBottom: bottomPadding,
          backgroundColor: containerBackground,
          borderTopColor: borderColor,
        },
        containerStyle,
      ]}
    >
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const onPress = () => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };
          const { active, inactive } = ICONS[route.name] ?? {
            active: 'ellipse',
            inactive: 'ellipse',
          };
          const iconName = focused ? active : inactive;
          const label = descriptors[route.key].options.title ?? route.name.replace(/Tab$/, '');

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabButton}
              onPress={onPress}
              activeOpacity={0.75}
            >
              <View style={styles.tabContent}>
                <Animated.View
                  style={[
                    styles.iconWrapper,
                    { transform: [{ scale: scaleValuesRef.current[index] }] },
                  ]}
                >
                  <Ionicons name={iconName} size={30} color={focused ? theme.colors.accent : theme.colors.textDim} />
                </Animated.View>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={[
                    styles.label,
                    focused ? { color: labelActiveColor } : { color: labelColor },
                  ]}
                >
                  {label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 0,
    paddingTop: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -10 },
    zIndex: 20,
  },
  bar: {
    height: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 10,
  },
  tabContent: {
    width: 88,
    height: 66,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
