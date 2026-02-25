import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';
import { logEvent } from '../../services/sentry';

type PlanOption = {
  productId: string;
  title: string;
  price: string;
  detail: string;
  badge?: string;
};

const fallbackPlans: PlanOption[] = [
  {
    productId: 'verityprotect_monthly',
    title: 'Monthly',
    price: '$9.99 / month',
    detail: 'Flexible monthly billing',
  },
  {
    productId: 'verityprotect_annual',
    title: 'Annual',
    price: '$99.99 / year',
    detail: 'Best value for long-term protection',
    badge: 'Save over monthly',
  },
];

function toPlanOption(product: {
  productId: string;
  displayName: string;
  displayPrice: string;
  subscriptionPeriodUnit?: string | null;
}): PlanOption {
  const normalizedUnit = (product.subscriptionPeriodUnit ?? '').toLowerCase();
  const suffix =
    normalizedUnit === 'year'
      ? ' / year'
      : normalizedUnit === 'month'
        ? ' / month'
        : '';

  return {
    productId: product.productId,
    title: product.displayName || (product.productId.includes('annual') ? 'Annual' : 'Monthly'),
    price: `${product.displayPrice}${suffix}`,
    detail:
      product.productId === 'verityprotect_annual'
        ? 'Best value for long-term protection'
        : 'Flexible monthly billing',
    badge: product.productId === 'verityprotect_annual' ? 'Save over monthly' : undefined,
  };
}

export default function MembershipScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Membership'>>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createMembershipStyles(theme), [theme]);

  const {
    status,
    products,
    selectedDefaultProductId,
    isLoadingProducts,
    isProcessingPurchase,
    statusError,
    purchase,
    restore,
  } = useSubscription();

  const planOptions = useMemo<PlanOption[]>(() => {
    if (!products.length) {
      return fallbackPlans;
    }
    return products.map(toPlanOption);
  }, [products]);

  const [selectedProductId, setSelectedProductId] = useState<string>(selectedDefaultProductId);
  const [message, setMessage] = useState<string>('');
  const [isBillingExpanded, setIsBillingExpanded] = useState(false);
  const [showPurchaseSuccess, setShowPurchaseSuccess] = useState(false);
  const purchaseSuccessScale = useRef(new Animated.Value(0.84)).current;
  const purchaseSuccessOpacity = useRef(new Animated.Value(0)).current;
  const showInviteCodeAction = status?.canJoinWithInviteCode !== false;

  useEffect(() => {
    setSelectedProductId((prev) => {
      if (planOptions.some((plan) => plan.productId === prev)) {
        return prev;
      }
      return selectedDefaultProductId;
    });
  }, [planOptions, selectedDefaultProductId]);

  const selectedPlan =
    planOptions.find((plan) => plan.productId === selectedProductId) ??
    planOptions[0] ??
    fallbackPlans[0];

  const setPlan = (productId: string) => {
    void Haptics.selectionAsync().catch(() => null);
    setSelectedProductId(productId);
    setMessage('');
    logEvent('membership_plan_selected', {
      screen: 'MembershipScreen',
      extra: { productId },
    });
  };

  const runPurchaseSuccessAnimation = async () => {
    setShowPurchaseSuccess(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);

    await new Promise<void>((resolve) => {
      Animated.sequence([
        Animated.parallel([
          Animated.spring(purchaseSuccessScale, {
            toValue: 1,
            speed: 20,
            bounciness: 8,
            useNativeDriver: true,
          }),
          Animated.timing(purchaseSuccessOpacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(420),
        Animated.timing(purchaseSuccessOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        purchaseSuccessScale.setValue(0.84);
        purchaseSuccessOpacity.setValue(0);
        setShowPurchaseSuccess(false);
        resolve();
      });
    });
  };

  const handlePurchase = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    setMessage('');
    const result = await purchase(selectedPlan.productId);
    if (result.status === 'purchased') {
      await runPurchaseSuccessAnimation();
      logEvent('membership_purchase_success', {
        screen: 'MembershipScreen',
        extra: { productId: selectedPlan.productId },
      });
      return;
    }
    setMessage(result.message ?? 'Purchase did not complete.');
  };

  const handleRestore = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    setMessage('');
    const result = await restore();
    if (result.status === 'purchased') {
      return;
    }
    setMessage(result.message ?? 'No active purchase found to restore.');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 20) + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Protect your family phone line</Text>
          <Text style={styles.subtitle}>
            Learn how Verity works, then choose a plan to activate call protection.
          </Text>
        </View>

        <Pressable
          style={styles.experienceCard}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
            navigation.navigate('MembershipExperience');
          }}
        >
          <View style={styles.experienceIconWrap}>
            <Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.experienceTextWrap}>
            <Text style={styles.experienceTitle}>See how Verity works</Text>
            <Text style={styles.experienceCopy}>
              Walk through the full call-screening flow with an interactive demo.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </Pressable>

        <View style={styles.planSection}>
          <Text style={styles.planSectionTitle}>Choose your plan</Text>
          {planOptions.map((plan) => {
            const selected = selectedPlan.productId === plan.productId;
            return (
              <Pressable
                key={plan.productId}
                style={[styles.planCard, selected && styles.planCardSelected]}
                onPress={() => setPlan(plan.productId)}
              >
                <View style={styles.planMainRow}>
                  <View style={styles.planTextWrap}>
                    <Text style={styles.planTitle}>{plan.title}</Text>
                    <Text style={styles.planDetail}>{plan.detail}</Text>
                  </View>
                  <View style={styles.planPriceWrap}>
                    <Text style={styles.planPrice}>{plan.price}</Text>
                    {plan.badge ? <Text style={styles.planBadge}>{plan.badge}</Text> : null}
                  </View>
                </View>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected ? <View style={styles.radioInner} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.actionsInline, !showInviteCodeAction && styles.actionsInlineSingle]}>
          <Pressable
            style={styles.inlineButton}
            onPress={handleRestore}
            disabled={isProcessingPurchase}
          >
            <Text style={styles.inlineButtonText}>Restore purchase</Text>
          </Pressable>
          {showInviteCodeAction ? (
            <Pressable
              style={styles.inlineButton}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                navigation.navigate('OnboardingInviteCode');
              }}
              disabled={isProcessingPurchase}
            >
              <Text style={styles.inlineButtonText}>I have an invite code</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.billingCard}>
          <Pressable
            style={styles.billingHeaderRow}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => null);
              setIsBillingExpanded((prev) => !prev);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Toggle membership billing details"
          >
            <View style={styles.billingHeaderTextWrap}>
              <Text style={styles.billingTitle}>Why membership is required</Text>
              <Text style={styles.billingSummary}>
                Covers phone infrastructure, recording, and active fraud monitoring.
              </Text>
            </View>
            <Ionicons
              name={isBillingExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={theme.colors.textMuted}
            />
          </Pressable>
          {isBillingExpanded ? (
            <Text style={styles.billingCopy}>
              Billing is handled by Apple, and you can cancel anytime in iPhone subscription settings. If
              a renewal payment fails, both plans include a 3-day billing grace period for all renewals
              before service is paused.
            </Text>
          ) : null}
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync().catch(() => null);
              navigation.navigate('SupportPortal');
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open billing help"
          >
            <Text style={styles.billingHelpLink}>Billing help</Text>
          </Pressable>
        </View>

        {(statusError || message) ? (
          <Text style={styles.errorText}>{message || statusError}</Text>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handlePurchase}
          disabled={isProcessingPurchase || isLoadingProducts}
        >
          {isProcessingPurchase || isLoadingProducts ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Continue with App Store</Text>
          )}
        </Pressable>
      </View>

      {showPurchaseSuccess ? (
        <View style={styles.purchaseSuccessOverlay} pointerEvents="none">
          <Animated.View
            style={[
              styles.purchaseSuccessCard,
              {
                opacity: purchaseSuccessOpacity,
                transform: [{ scale: purchaseSuccessScale }],
              },
            ]}
          >
            <View style={styles.purchaseSuccessIcon}>
              <Ionicons name="checkmark" size={22} color="#FFFFFF" />
            </View>
            <Text style={styles.purchaseSuccessTitle}>Membership Activated</Text>
            <Text style={styles.purchaseSuccessText}>Verity protection is now live.</Text>
          </Animated.View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const createMembershipStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 22,
      gap: 16,
    },
    headerBlock: {
      gap: 8,
      marginBottom: 4,
    },
    title: {
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: theme.colors.text,
      lineHeight: 38,
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.textMuted,
      lineHeight: 22,
    },
    experienceCard: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.35),
      backgroundColor: withOpacity(theme.colors.accent, 0.08),
      padding: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    experienceIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.accent, 0.16),
    },
    experienceTextWrap: {
      flex: 1,
      gap: 2,
    },
    experienceTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text,
    },
    experienceCopy: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textMuted,
    },
    planSection: {
      gap: 10,
    },
    planSectionTitle: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    planCard: {
      borderRadius: 24,
      padding: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 10,
    },
    planCardSelected: {
      borderColor: withOpacity(theme.colors.accent, 0.8),
      backgroundColor: withOpacity(theme.colors.accent, 0.09),
    },
    planMainRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    planTextWrap: {
      flex: 1,
      gap: 2,
    },
    planTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.text,
    },
    planDetail: {
      fontSize: 13,
      color: theme.colors.textMuted,
    },
    planPriceWrap: {
      alignItems: 'flex-end',
      gap: 2,
    },
    planPrice: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text,
    },
    planBadge: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: withOpacity(theme.colors.textMuted, 0.45),
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-end',
    },
    radioSelected: {
      borderColor: theme.colors.accent,
    },
    radioInner: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
      backgroundColor: theme.colors.accent,
    },
    actionsInline: {
      flexDirection: 'row',
      gap: 10,
    },
    actionsInlineSingle: {
      justifyContent: 'flex-start',
    },
    inlineButton: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.accent,
      textAlign: 'center',
    },
    billingCard: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 16,
      gap: 7,
    },
    billingHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    billingHeaderTextWrap: {
      flex: 1,
      gap: 2,
    },
    billingTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
    billingSummary: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textMuted,
    },
    billingCopy: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textMuted,
    },
    billingHelpLink: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.accent,
      marginTop: 2,
      alignSelf: 'flex-start',
    },
    errorText: {
      marginTop: 4,
      fontSize: 13,
      color: theme.colors.danger,
      textAlign: 'center',
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 24,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: withOpacity(theme.colors.bg, 0.95),
    },
    primaryButton: {
      height: 58,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
    },
    primaryButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.99 }],
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    purchaseSuccessOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    purchaseSuccessCard: {
      width: '100%',
      maxWidth: 320,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.success, 0.45),
      backgroundColor: withOpacity(theme.colors.surface, 0.96),
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 22,
      paddingHorizontal: 18,
      gap: 6,
    },
    purchaseSuccessIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.success,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    purchaseSuccessTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    purchaseSuccessText: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
  });
