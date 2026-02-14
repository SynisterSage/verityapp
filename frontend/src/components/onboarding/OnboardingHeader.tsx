import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import SupportButton from '../common/SupportButton';

import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import { useSupportContext } from '../../context/SupportContext';
import { navigateToSupportPortal } from '../../navigation/rootNavigator';

type Props = {
  chapter: string;
  totalSteps?: number;
  activeStep?: number;
  showBack?: boolean;
};

const TOTAL_SEGMENTS = 10;

export default function OnboardingHeader({
  chapter,
  activeStep = 0,
  totalSteps = TOTAL_SEGMENTS,
  showBack = true,
}: Props) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme, mode } = useTheme();
  const steps = useMemo(() => Array.from({ length: totalSteps }, (_, index) => index), [totalSteps]);
  const animatedWidthsRef = useRef<Animated.Value[]>([]);

  if (animatedWidthsRef.current.length !== steps.length) {
    animatedWidthsRef.current = steps.map(() => new Animated.Value(6));
  }

  useEffect(() => {
    animatedWidthsRef.current.forEach((value, index) => {
      const targetWidth = index < activeStep ? 12 : 6;
      Animated.spring(value, {
        toValue: targetWidth,
        useNativeDriver: false,
        stiffness: 180,
        damping: 18,
      }).start();
    });
  }, [activeStep, steps]);

  const animatedWidths = animatedWidthsRef.current;

  const progressActiveColor = theme.colors.accent;
  const progressInactiveColor = withOpacity(theme.colors.accent, 0.15);
  const { unreadAgentCount } = useSupportContext();

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.colors.bg }]}>
      <BlurView intensity={100} tint={mode === 'light' ? 'light' : 'dark'} style={styles.blur}>
        <View style={[styles.overlay, { backgroundColor: theme.colors.bg }]} pointerEvents="none" />
        <View
          style={[
            styles.container,
            {
              // SafeAreaView already accounts for the notch/status bar; keep internal padding minimal.
              paddingTop: 8,
              paddingBottom: 10,
              paddingHorizontal: showBack ? 20 : 32,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.topRow}>
            <View style={[styles.leftSlot, !showBack && styles.leftSlotHidden]}>
              {showBack ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.backButton,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceAlt,
                      transform: [{ scale: pressed ? 0.9 : 1 }],
                    },
                  ]}
                  onPress={() => navigation.goBack()}
                >
                  <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.chapterContainer, !showBack && styles.chapterContainerFlush]}>
              <Text style={[styles.chapter, showBack && styles.chapterCompact, { color: theme.colors.text, opacity: 0.7 }]}>
                {chapter.toUpperCase()}
              </Text>
            </View>

            <View style={styles.progressRow}>
              <View style={styles.progress}>
                {steps.map((step) => {
                  const isActive = step < activeStep;
                  const width = animatedWidths[step];
                  return (
                    <Animated.View
                      key={step}
                      style={[
                        styles.pill,
                        step !== steps.length - 1 && styles.pillSpacing,
                        {
                          width,
                          backgroundColor: isActive ? progressActiveColor : progressInactiveColor,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            </View>

            <SupportButton
              onPress={navigateToSupportPortal}
              unreadCount={unreadAgentCount}
              compact={showBack}
              style={styles.supportButton}
            />
          </View>
        </View>
      </BlurView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    width: '100%',
  },
  blur: {
    width: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
  },
  container: {
    borderBottomWidth: 1,
    justifyContent: 'center',
    minHeight: 88,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftSlot: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  leftSlotHidden: {
    width: 0,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapter: {
    fontSize: 10,
    letterSpacing: 6,
    fontWeight: '900',
  },
  chapterCompact: {
    letterSpacing: 3,
  },
  chapterContainer: {
    marginLeft: 12,
    marginRight: 12,
    flexShrink: 0,
    justifyContent: 'center',
  },
  chapterContainerFlush: {
    marginLeft: 0,
  },
  progress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    height: 8,
    borderRadius: 4,
  },
  pillSpacing: {
    marginRight: 4,
  },
  progressRow: {
    flex: 1,
    minWidth: 0,
  },
  supportButton: {
    marginLeft: 10,
  },
});
