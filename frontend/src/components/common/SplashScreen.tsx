import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../../context/ThemeContext';

const ICON_SIZE = 160;

const SplashScreen: React.FC = () => {
  const { theme, mode } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1200),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.05,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [opacity, scale]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 240 240">
          <Path
            d="M0 51.9856C0 23.2747 23.2747 0 51.9856 0L188.014 0C216.725 0 240 23.2747 240 51.9856V188.014C240 216.725 216.725 240 188.014 240H51.9856C23.2747 240 0 216.725 0 188.014L0 51.9856Z"
            fill={mode === 'dark' ? '#121A26' : theme.colors.surface}
          />
          <Path
            d="M46.6266 143.015C36.0291 143.015 27.3694 134.191 29.4668 123.803C38.442 79.3501 73.4574 44.3352 117.91 35.3602C128.298 33.2629 137.123 41.9226 137.123 52.52C137.123 62.5915 129.061 70.6325 119.383 73.4221C94.4098 80.6208 74.7276 100.303 67.5287 125.276C64.739 134.953 56.698 143.015 46.6266 143.015Z"
            fill="#8AB4FF"
          />
          <Path
            d="M83.1432 143.015C77.5439 143.015 72.9759 138.36 73.9933 132.854C78.9533 106.009 100.116 84.8456 126.961 79.885C132.467 78.8675 137.123 83.4357 137.123 89.0353C137.123 94.3643 132.866 98.6325 127.698 99.9327C111.189 104.086 98.1936 117.082 94.0401 133.591C92.74 138.759 88.4719 143.015 83.1432 143.015Z"
            fill="#8AB4FF"
          />
          <Path
            d="M118.773 143.015C108.432 143.015 99.8051 133.984 104.964 125.022C108.349 119.141 113.249 114.242 119.13 110.857C128.092 105.699 137.123 114.325 137.123 124.666C137.123 134.8 128.907 143.015 118.773 143.015Z"
            fill="#8AB4FF"
          />
          <Path
            d="M198.256 143.658L198.256 115.539C198.256 105.277 189.937 96.9585 179.675 96.9585L161.831 96.9585C151.624 96.9585 143.329 105.191 143.25 115.397L143.12 132.404C143.041 142.61 134.746 150.843 124.54 150.843L108.814 150.843C98.3088 150.843 89.8928 159.544 90.2433 170.043L90.8171 187.23C91.1515 197.245 99.367 205.191 109.387 205.191L137.093 205.191C142.049 205.191 146.799 203.211 150.288 199.692L192.87 156.739C196.32 153.259 198.256 148.558 198.256 143.658Z"
            fill={theme.colors.accent}
          />
        </Svg>
        <Text style={[styles.primaryText, { color: theme.colors.text, fontFamily: theme.typography.fontFamily }]}>
          Verity
        </Text>
        <Text style={[styles.secondaryText, { color: theme.colors.textMuted, fontFamily: theme.typography.fontFamily }]}>
          Protect
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
  },
  primaryText: {
    marginTop: 16,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryText: {
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginTop: 4,
  },
});

export default SplashScreen;
