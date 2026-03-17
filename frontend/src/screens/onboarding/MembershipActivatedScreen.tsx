import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../../context/ThemeContext';
import {
  useSubscription,
  type MembershipActivationNotice,
} from '../../context/SubscriptionContext';
import type { RootStackParamList } from '../../navigation/types';
import type { AppTheme } from '../../theme/tokens';

function formatPlanLabel(notice: MembershipActivationNotice | null) {
  const explicit = (notice?.planLabel ?? '').trim();
  if (explicit) {
    return explicit;
  }

  const productId = (notice?.productId ?? '').toLowerCase();
  if (productId.includes('facility')) {
    return 'Facility Membership';
  }
  if (productId.includes('annual') || productId.includes('year')) {
    return 'Annual Membership';
  }
  if (productId.includes('monthly') || productId.includes('month')) {
    return 'Monthly Membership';
  }
  return 'Membership';
}

function getPlanType(productId: string): 'monthly' | 'annual' | 'facility' | 'unknown' {
  const normalized = productId.toLowerCase();
  if (normalized.includes('facility')) {
    return 'facility';
  }
  if (normalized.includes('annual') || normalized.includes('year')) {
    return 'annual';
  }
  if (normalized.includes('monthly') || normalized.includes('month')) {
    return 'monthly';
  }
  return 'unknown';
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(parsed));
}

export default function MembershipActivatedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'MembershipActivated'>>();
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { membershipActivationNotice, clearMembershipActivationNotice, status } = useSubscription();
  const normalizedProductId = (
    membershipActivationNotice?.productId ??
    status?.subscription?.productId ??
    ''
  ).toLowerCase();
  const planLabel = formatPlanLabel(membershipActivationNotice);
  const planType = getPlanType(normalizedProductId);
  const trialEndsLabel = formatDateLabel(status?.subscription?.trialEndsAt);
  const subtitle =
    planType === 'facility'
      ? 'Your community protection is active. Verity will screen every call before it reaches your family.'
      : planType === 'annual'
        ? 'Your subscription is active. Verity will screen every call before it reaches your family.'
        : planType === 'monthly'
          ? 'Your 7-day free trial has started. Verity will screen every call before it reaches your family.'
          : `Your ${planLabel.toLowerCase()} is active. Verity will screen every call before it reaches your family.`;
  const primaryMeta =
    planType === 'facility'
      ? 'Partner benefits active'
      : trialEndsLabel
        ? `Trial ends ${trialEndsLabel}`
        : 'Protection active';
  const showInviteMeta = planType === 'facility';
  const buttonLabelColor = mode === 'light' ? theme.colors.surface : theme.colors.text;

  // Calm staggered entrance animations
  const backgroundAnim = useRef(new Animated.Value(0)).current;
  const iconAnim = useRef(new Animated.Value(0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const bodyAnim = useRef(new Animated.Value(0)).current;
  const metaAnim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    const ease = Easing.bezier(0.32, 1, 0.2, 1);

    Animated.parallel([
      Animated.timing(backgroundAnim, {
        toValue: 1,
        duration: 1200,
        easing: ease,
        useNativeDriver: true,
      }),
      Animated.timing(iconAnim, {
        toValue: 1,
        duration: 900,
        delay: 140,
        easing: ease,
        useNativeDriver: true,
      }),
      Animated.timing(titleAnim, {
        toValue: 1,
        duration: 700,
        delay: 320,
        easing: ease,
        useNativeDriver: true,
      }),
      Animated.timing(bodyAnim, {
        toValue: 1,
        duration: 700,
        delay: 420,
        easing: ease,
        useNativeDriver: true,
      }),
      Animated.timing(metaAnim, {
        toValue: 1,
        duration: 700,
        delay: 520,
        easing: ease,
        useNativeDriver: true,
      }),
      Animated.timing(buttonAnim, {
        toValue: 1,
        duration: 700,
        delay: 1000,
        easing: ease,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
    });
  }, [backgroundAnim, iconAnim, titleAnim, bodyAnim, metaAnim, buttonAnim]);

  const handleContinue = () => {
    void Haptics.selectionAsync().catch(() => null);
    clearMembershipActivationNotice();
    navigation.replace('OnboardingChoice');
  };

  const iconScale = iconAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
  const iconOpacity = iconAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const iconTranslate = iconAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  const titleTranslate = titleAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const bodyTranslate = bodyAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  const metaTranslate = metaAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  const buttonTranslate = buttonAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <Animated.View style={[styles.backgroundLayer, { opacity: backgroundAnim }]} />

        <View style={styles.content}>
          <Animated.View
            style={[
              styles.heroWrap,
              { opacity: iconOpacity, transform: [{ scale: iconScale }, { translateY: iconTranslate }] },
            ]}
          >
            <View style={styles.heroIconContainer}>
              <Ionicons name="shield-checkmark-outline" size={56} color={theme.colors.accent} />
            </View>
          </Animated.View>

          <Animated.View
            style={[
              styles.titleWrap,
              { opacity: titleAnim, transform: [{ translateY: titleTranslate }] },
            ]}
          >
            <Text style={styles.title}>You're protected.</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.bodyWrap,
              { opacity: bodyAnim, transform: [{ translateY: bodyTranslate }] },
            ]}
          >
            <Text style={styles.subtitle}>{subtitle}</Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.metaWrap,
              { opacity: metaAnim, transform: [{ translateY: metaTranslate }] },
            ]}
          >
            <Text style={styles.metaText}>{primaryMeta}</Text>
            {showInviteMeta ? <Text style={styles.metaText}>Invite code applied {'\u2713'}</Text> : null}
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.buttonWrap,
            { opacity: buttonAnim, transform: [{ translateY: buttonTranslate }] },
          ]}
        >
          <Pressable style={styles.primaryButton} onPress={handleContinue}>
            <Text style={[styles.primaryButtonText, { color: buttonLabelColor }]}>Set Up Protection</Text>
            <Ionicons name="arrow-forward" size={22} color={buttonLabelColor} />
          </Pressable>
          <Text style={styles.helperText}>Takes about 1 minute</Text>
        </Animated.View>
          </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    container: {
      flex: 1,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.lg,
    },
    backgroundLayer: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.bg,
    },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.md,
    },
    heroWrap: {
      marginBottom: theme.spacing.xl,
    },
    heroIconContainer: {
      width: 128,
      height: 128,
      borderRadius: 64,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    titleWrap: {
      alignItems: 'center',
    },
    title: {
      fontSize: theme.typography.title.size,
      fontWeight: theme.typography.title.weight,
      lineHeight: theme.typography.title.lineHeight,
      color: theme.colors.text,
      textAlign: 'center',
      letterSpacing: -0.6,
    },
    bodyWrap: {
      alignItems: 'center',
    },
    subtitle: {
      maxWidth: 280,
      fontSize: theme.typography.subtitle.size,
      lineHeight: theme.typography.subtitle.lineHeight,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    metaWrap: {
      marginTop: theme.spacing.sm,
      alignItems: 'center',
      gap: theme.spacing.xs,
      minHeight: theme.typography.caption.lineHeight * 2 + theme.spacing.xs,
    },
    metaText: {
      fontSize: theme.typography.caption.size,
      lineHeight: theme.typography.caption.lineHeight,
      color: theme.colors.textDim,
      textAlign: 'center',
    },
    buttonWrap: {
      width: '100%',
      maxWidth: 360,
      alignSelf: 'center',
      gap: theme.spacing.sm,
    },
    primaryButton: {
      height: theme.components.button.height,
      borderRadius: theme.components.button.radius,
      backgroundColor: theme.colors.accent,
      paddingHorizontal: theme.spacing.lg,
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    primaryButtonText: {
      fontSize: theme.typography.bodyStrong.size,
      fontWeight: theme.typography.bodyStrong.weight,
      letterSpacing: 0.2,
    },
    helperText: {
      fontSize: theme.typography.caption.size,
      lineHeight: theme.typography.caption.lineHeight,
      color: theme.colors.textDim,
      textAlign: 'center',
    },
  });
