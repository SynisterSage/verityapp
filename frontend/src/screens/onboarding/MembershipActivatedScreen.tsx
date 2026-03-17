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
import { withOpacity } from '../../utils/color';

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

export default function MembershipActivatedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'MembershipActivated'>>();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { membershipActivationNotice, clearMembershipActivationNotice, status } = useSubscription();
  const planLabel = formatPlanLabel(membershipActivationNotice);
  const normalizedProductId = (
    membershipActivationNotice?.productId ??
    status?.subscription?.productId ??
    ''
  ).toLowerCase();
  const isFacilityPlan = normalizedProductId.includes('facility');
  const hasActiveTrial = Boolean(
    status?.hasActiveSubscription &&
      status.subscription?.trialEndsAt &&
      !status.subscription?.trialConvertedAt
  );
  const subtitle = hasActiveTrial
    ? isFacilityPlan
      ? 'Your facility membership trial is active. You now have full protection during the 14-day trial.'
      : `Your ${planLabel} trial is active. You now have full protection during your free trial.`
    : isFacilityPlan
      ? 'Your facility membership is active. Your protection and partner pricing are now in place.'
      : `Your ${planLabel} is active and ready to protect your account.`;

  // Staggered entrance anims
  const cardAnim = useRef(new Animated.Value(0)).current;
  const iconAnim = useRef(new Animated.Value(0)).current;
  const bodyAnim = useRef(new Animated.Value(0)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;
  // Ring pulse after entrance
  const ringAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => null);

    Animated.sequence([
      // Card fades/scales in
      Animated.spring(cardAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 5,
      }),
      // Icon pops in
      Animated.spring(iconAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 22,
        bounciness: 10,
      }),
      // Title + subtitle fade up
      Animated.timing(bodyAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      // Button fades up
      Animated.timing(buttonAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      // Single ring pulse
      Animated.timing(ringAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  }, [cardAnim, iconAnim, bodyAnim, buttonAnim, ringAnim]);

  const handleContinue = () => {
    void Haptics.selectionAsync().catch(() => null);
    clearMembershipActivationNotice();
    navigation.replace('OnboardingChoice');
  };

  const ringScale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const ringOpacity = ringAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 0.3, 0] });

  const cardOpacity = cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const cardScale = cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  const iconScale = iconAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const iconOpacity = iconAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const bodyTranslate = bodyAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  const buttonTranslate = buttonAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <Animated.View style={[styles.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
          {/* Accent top stripe */}
          <View style={styles.accentStripe} />

          <View style={styles.cardInner}>
            {/* Icon with ring pulse */}
            <Animated.View style={[styles.iconOuter, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}>
              <Animated.View
                style={[
                  styles.iconRing,
                  { opacity: ringOpacity, transform: [{ scale: ringScale }] },
                ]}
              />
              <View style={styles.iconWrap}>
                <Ionicons name="checkmark" size={32} color="#FFFFFF" />
              </View>
            </Animated.View>

            {/* Title + subtitle */}
            <Animated.View
              style={[
                styles.bodyWrap,
                { opacity: bodyAnim, transform: [{ translateY: bodyTranslate }] },
              ]}
            >
              <Text style={styles.title}>Membership Activated</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </Animated.View>

            {/* Button */}
            <Animated.View
              style={[
                styles.buttonWrap,
                { opacity: buttonAnim, transform: [{ translateY: buttonTranslate }] },
              ]}
            >
              <Pressable style={styles.primaryButton} onPress={handleContinue}>
                <Text style={styles.primaryButtonText}>Continue setup</Text>
              </Pressable>
            </Animated.View>
          </View>
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
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.07,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    accentStripe: {
      height: 3,
      backgroundColor: theme.colors.accent,
    },
    cardInner: {
      paddingHorizontal: 24,
      paddingTop: 28,
      paddingBottom: 28,
      alignItems: 'center',
      gap: 16,
    },
    iconOuter: {
      width: 80,
      height: 80,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconRing: {
      position: 'absolute',
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 2,
      borderColor: theme.colors.success,
    },
    iconWrap: {
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.success,
      shadowColor: theme.colors.success,
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
    bodyWrap: {
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: theme.colors.text,
      textAlign: 'center',
      letterSpacing: -0.4,
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    buttonWrap: {
      alignSelf: 'stretch',
      marginTop: 4,
    },
    primaryButton: {
      alignSelf: 'stretch',
      borderRadius: 16,
      backgroundColor: theme.colors.accent,
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
  });
