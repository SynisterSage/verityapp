import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';

type TrialReminderModalProps = {
  visible: boolean;
  daysLeft: number;
  theme: AppTheme;
  mode?: 'light' | 'dark' | string;
  onManage: () => void;
  onLater: () => void;
};

function resolveDayCopy(daysLeft: number) {
  if (daysLeft <= 0) {
    return 'Your trial ends today.';
  }
  if (daysLeft === 1) {
    return 'Your trial ends in 1 day.';
  }
  return `Your trial ends in ${daysLeft} days.`;
}

export default function TrialReminderModal({
  visible,
  daysLeft,
  theme,
  mode,
  onManage,
  onLater,
}: TrialReminderModalProps) {
  const styles = useMemo(() => createStyles(theme, mode), [mode, theme]);
  const [isMounted, setIsMounted] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const cardOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const cardTranslateY = useRef(new Animated.Value(visible ? 0 : 12)).current;
  const cardScale = useRef(new Animated.Value(visible ? 1 : 0.98)).current;

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 210,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cardTranslateY, {
          toValue: 0,
          duration: 210,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 1,
          duration: 210,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 170,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 10,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 0.985,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
      }
    });
  }, [backdropOpacity, cardOpacity, cardScale, cardTranslateY, visible]);

  if (!isMounted) {
    return null;
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onLater} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onLater} disabled={!visible}>
          <Animated.View style={[styles.backdropAnimatedLayer, { opacity: backdropOpacity }]}>
            <BlurView intensity={65} tint={mode === 'dark' ? 'dark' : 'light'} style={styles.blur} />
            <View style={styles.scrim} />
          </Animated.View>
        </Pressable>
        <Animated.View
          style={[
            styles.cardWrap,
            {
              opacity: cardOpacity,
              transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
            },
          ]}
        >
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="shield-checkmark" size={28} color={theme.colors.accent} />
            </View>
            <View style={styles.copyWrap}>
              <Text style={styles.title}>Keep your protection active</Text>
              <Text style={styles.body}>
                {resolveDayCopy(daysLeft)} Keep your verified number and call screening active without interruption.
              </Text>
            </View>
            <Pressable style={styles.primaryButton} onPress={onManage}>
              <Text style={styles.primaryButtonText}>Review membership</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={onLater}>
              <Text style={styles.secondaryButtonText}>Not now</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: AppTheme, mode?: 'light' | 'dark' | string) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 28,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    backdropAnimatedLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    blur: {
      ...StyleSheet.absoluteFillObject,
    },
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor:
        mode === 'dark' ? withOpacity(theme.colors.bg, 0.54) : withOpacity(theme.colors.text, 0.22),
    },
    cardWrap: {
      width: '100%',
      maxWidth: 380,
    },
    card: {
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 18,
      paddingVertical: 18,
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: mode === 'dark' ? 0.35 : 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    copyWrap: {
      gap: 6,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    primaryButton: {
      height: 50,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
    },
    primaryButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
    },
    secondaryButton: {
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
  });
