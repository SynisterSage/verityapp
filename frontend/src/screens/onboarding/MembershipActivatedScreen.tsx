import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const { membershipActivationNotice, clearMembershipActivationNotice } = useSubscription();
  const planLabel = formatPlanLabel(membershipActivationNotice);

  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => null);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 7,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
    });
  }, [opacityAnim, scaleAnim]);

  const handleContinue = () => {
    void Haptics.selectionAsync().catch(() => null);
    clearMembershipActivationNotice();
    navigation.replace('OnboardingChoice');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <Animated.View style={[styles.card, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark" size={34} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Membership Activated</Text>
          <Text style={styles.subtitle}>Your {planLabel} is active and protecting your account.</Text>
          <Pressable style={styles.primaryButton} onPress={handleContinue}>
            <Text style={styles.primaryButtonText}>Continue setup</Text>
          </Pressable>
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
      borderColor: withOpacity(theme.colors.accent, 0.35),
      backgroundColor: withOpacity(theme.colors.accent, 0.08),
      paddingHorizontal: 22,
      paddingVertical: 28,
      alignItems: 'center',
      gap: 14,
    },
    iconWrap: {
      width: 74,
      height: 74,
      borderRadius: 37,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.success,
      shadowColor: theme.colors.success,
      shadowOpacity: 0.32,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 7 },
      elevation: 7,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: theme.colors.text,
      textAlign: 'center',
      letterSpacing: -0.4,
    },
    subtitle: {
      fontSize: 16,
      lineHeight: 22,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    primaryButton: {
      marginTop: 6,
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
