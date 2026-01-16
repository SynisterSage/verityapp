import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../../context/ThemeContext';

const ICON_SIZE = 120;

const SplashScreen: React.FC = () => {
  const { theme } = useTheme();
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
        <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 150 150">
          <Path
            d="M0 32.491C0 14.5467 14.5467 0 32.491 0H117.509C135.453 0 150 14.5467 150 32.491V117.509C150 135.453 135.453 150 117.509 150H32.491C14.5467 150 0 135.453 0 117.509V32.491Z"
            fill={theme.colors.bg}
          />
          <Path
            d="M33.1248 89.6841C26.5014 89.6841 21.0891 84.1689 22.3999 77.6765C28.0094 49.8934 49.8942 28.0092 77.6775 22.3999C84.1699 21.0891 89.6851 26.5014 89.6851 33.1248C89.6851 39.4194 84.6464 44.4451 78.598 46.1885C62.9895 50.6877 50.6879 62.9887 46.1886 78.597C44.4451 84.6454 39.4194 89.6841 33.1248 89.6841Z"
            fill={theme.colors.accent}
          />
          <Path
            d="M55.9485 89.6841C52.4488 89.6841 49.5937 86.7744 50.2296 83.3329C53.3296 66.5555 66.555 53.3299 83.3324 50.2297C86.7741 49.5937 89.6841 52.449 89.6841 55.949C89.6841 59.2798 87.0237 61.9476 83.7935 62.7603C73.476 65.3559 65.3549 73.4766 62.7592 83.794C61.9467 87.0239 59.2791 89.6841 55.9485 89.6841Z"
            fill={theme.colors.accent}
          />
          <Path
            d="M78.2164 89.6841C71.7531 89.6841 66.3613 84.0396 69.5858 78.4382C71.7017 74.7626 74.7637 71.7008 78.4395 69.5852C84.041 66.3613 89.6851 71.7526 89.6851 78.2156C89.6851 84.5495 84.5502 89.6841 78.2164 89.6841Z"
            fill={theme.colors.accent}
          />
          <Path
            d="M127.893 90.0856L127.893 72.5115C127.893 66.0979 122.693 60.8986 116.28 60.8986L105.127 60.8986C98.7479 60.8986 93.5631 66.0437 93.5142 72.4224L93.4326 83.0523C93.3836 89.431 88.1988 94.5761 81.82 94.5761L71.9912 94.5761C65.4257 94.5761 60.1657 100.015 60.3847 106.577L60.7434 117.319C60.9524 123.578 66.087 128.544 72.3499 128.544L89.6657 128.544C92.763 128.544 95.7321 127.307 97.9127 125.107L124.527 98.2616C126.683 96.0867 127.893 93.1481 127.893 90.0856Z"
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
