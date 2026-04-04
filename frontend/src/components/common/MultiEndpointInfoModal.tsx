import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';

type MultiEndpointInfoModalProps = {
  visible: boolean;
  onClose: () => void;
  theme: AppTheme;
  mode?: 'light' | 'dark' | string;
};

export default function MultiEndpointInfoModal({
  visible,
  onClose,
  theme,
  mode,
}: MultiEndpointInfoModalProps) {
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
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} disabled={!visible}>
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
            <Text style={styles.title}>Your phone numbers</Text>
            <Text style={styles.body}>
              Your mobile phone is how you use the Verity app. Optionally add a landline for calls from home or office phones.
            </Text>
            <View style={styles.row}>
              <Ionicons name="phone-portrait-outline" size={17} color={theme.colors.accent} />
              <Text style={styles.rowText}>
                <Text style={{ fontWeight: '600' }}>Mobile phone</Text> — Required. Your VoIP app phone number
              </Text>
            </View>
            <View style={styles.row}>
              <Ionicons name="call-outline" size={17} color={theme.colors.warning ?? theme.colors.textMuted} />
              <Text style={styles.rowText}>
                <Text style={{ fontWeight: '600' }}>Landline</Text> — Optional. Home or office phone lines
              </Text>
            </View>
            <View style={styles.row}>
              <Ionicons name="checkmark-circle-outline" size={17} color={theme.colors.success} />
              <Text style={styles.rowText}>Set up landline anytime, even later in Settings.</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.dismissButton, pressed && styles.dismissButtonPressed]}
              onPress={onClose}
            >
              <Text style={styles.dismissButtonText}>Got it</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(theme: AppTheme, mode?: string | 'light' | 'dark') {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'transparent',
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
      width: '100%',
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 18,
      paddingVertical: 18,
      gap: 10,
      shadowColor: '#000',
      shadowOpacity: mode === 'dark' ? 0.35 : 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    rowText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.text,
    },
    dismissButton: {
      height: 44,
      marginTop: 2,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
    },
    dismissButtonPressed: {
      opacity: 0.8,
    },
    dismissButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
}
