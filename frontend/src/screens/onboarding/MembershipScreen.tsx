import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
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
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';
import { logEvent } from '../../services/sentry';
import { MEMBERSHIP_SIGNOUT_NOTE_KEY } from '../../utils/membership';
import { FALLBACK_LEGAL_VERSIONS, fetchCurrentLegalVersions } from '../../services/legal';

type PlanOption = {
  productId: string;
  title: string;
  price: string;
  detail: string;
  badge?: string;
};

type MembershipFeedback = {
  kind: 'product_not_found' | 'network' | 'cancelled' | 'pending' | 'failed';
  title: string;
  detail: string;
  tone: 'error' | 'info';
  retryProducts?: boolean;
};

const fallbackPlans: PlanOption[] = [
  {
    productId: 'verityprotect_monthly',
    title: 'Monthly',
    price: '$9.99 / month',
    detail: 'Flexible, cancel anytime',
  },
  {
    productId: 'verityprotect_annual',
    title: 'Annual',
    price: '$99.99 / year',
    detail: 'Save 17% vs monthly',
    badge: 'Best Value',
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
        ? 'Save 17% vs monthly'
        : 'Flexible, cancel anytime',
    badge: product.productId === 'verityprotect_annual' ? 'Best Value' : undefined,
  };
}

const FEATURES: { icon: string; text: string }[] = [
  { icon: 'shield-checkmark-outline', text: 'Screens every call before it reaches you' },
  { icon: 'warning-outline', text: 'Flags scam and fraud attempts in real time' },
  { icon: 'person-circle-outline', text: 'Trusted contacts skip screening automatically' },
  { icon: 'mic-outline', text: 'Call recordings and transcripts saved securely' },
  { icon: 'people-outline', text: 'Add family members to your protection circle' },
];

function isNetworkIssue(message: string) {
  return /network|internet|offline|timed out|could not connect/i.test(message);
}

function isProductUnavailable(message: string) {
  return /product not found|not available|not found/i.test(message);
}

function toPurchaseFeedback(result: { status: string; message?: string }): MembershipFeedback {
  const normalizedMessage = (result.message ?? '').trim();

  if (result.status === 'cancelled') {
    return {
      kind: 'cancelled',
      title: 'Purchase canceled',
      detail: 'No charge was made. Choose a plan whenever you are ready.',
      tone: 'info',
    };
  }

  if (result.status === 'pending') {
    return {
      kind: 'pending',
      title: 'Purchase pending',
      detail: 'Apple is still confirming this purchase. Membership activates automatically once approved.',
      tone: 'info',
    };
  }

  if (isProductUnavailable(normalizedMessage)) {
    return {
      kind: 'product_not_found',
      title: 'Plan unavailable',
      detail: 'This build could not find that App Store plan yet. Reload plans and try again.',
      tone: 'error',
      retryProducts: true,
    };
  }

  if (isNetworkIssue(normalizedMessage)) {
    return {
      kind: 'network',
      title: 'Network issue',
      detail: 'Check your connection and try again.',
      tone: 'error',
    };
  }

  return {
    kind: 'failed',
    title: 'Could not complete purchase',
    detail: normalizedMessage || 'Please try again.',
    tone: 'error',
  };
}

function toRestoreFeedback(result: { message?: string }): MembershipFeedback {
  const normalizedMessage = (result.message ?? '').trim();

  if (/no active subscription found/i.test(normalizedMessage)) {
    return {
      kind: 'pending',
      title: 'No active membership found',
      detail: 'No previous purchase is linked to this Apple account.',
      tone: 'info',
    };
  }

  if (isNetworkIssue(normalizedMessage)) {
    return {
      kind: 'network',
      title: 'Network issue',
      detail: 'Check your connection and try restore again.',
      tone: 'error',
    };
  }

  return {
    kind: 'failed',
    title: 'Could not restore purchase',
    detail: normalizedMessage || 'Please try again.',
    tone: 'error',
  };
}

export default function MembershipScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Membership'>>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createMembershipStyles(theme), [theme]);
  const { signOut } = useAuth();

  const {
    status,
    products,
    selectedDefaultProductId,
    isLoadingProducts,
    isProcessingPurchase,
    statusError,
    productsError,
    refreshStatus,
    refreshProducts,
    purchase,
    restore,
    showMembershipActivationNotice,
  } = useSubscription();

  const planOptions = useMemo<PlanOption[]>(() => {
    if (!products.length) {
      return fallbackPlans;
    }
    return products.map(toPlanOption);
  }, [products]);

  const [selectedProductId, setSelectedProductId] = useState<string>(selectedDefaultProductId);
  const [feedback, setFeedback] = useState<MembershipFeedback | null>(null);
  const [isBillingExpanded, setIsBillingExpanded] = useState(false);
  const [footerHeight, setFooterHeight] = useState(156);
  const [showExitModal, setShowExitModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isOpeningManage, setIsOpeningManage] = useState(false);
  const [legalVersions, setLegalVersions] = useState(FALLBACK_LEGAL_VERSIONS);
  useEffect(() => {
    fetchCurrentLegalVersions().then(setLegalVersions).catch(() => null);
  }, []);
  const exitBackdropOpacity = useRef(new Animated.Value(0)).current;
  const exitCardOpacity = useRef(new Animated.Value(0)).current;
  const exitCardTranslateY = useRef(new Animated.Value(10)).current;
  const exitCardScale = useRef(new Animated.Value(0.985)).current;
  const planScaleByIdRef = useRef<Record<string, Animated.Value>>({});
  const hasLoggedMembershipView = useRef(false);
  const showInviteCodeAction = status?.canJoinWithInviteCode !== false;
  const plansUnavailable = !isLoadingProducts && products.length === 0;

  useEffect(() => {
    if (products.length > 0 || isLoadingProducts) {
      return;
    }
    void refreshProducts();
  }, [isLoadingProducts, products.length, refreshProducts]);

  useEffect(() => {
    setSelectedProductId((prev) => {
      if (planOptions.some((plan) => plan.productId === prev)) {
        return prev;
      }
      return selectedDefaultProductId;
    });
  }, [planOptions, selectedDefaultProductId]);

  useEffect(() => {
    if (hasLoggedMembershipView.current) {
      return;
    }
    hasLoggedMembershipView.current = true;
    logEvent('membership_screen_viewed', {
      screen: 'MembershipScreen',
    });
  }, []);

  const selectedPlan =
    planOptions.find((plan) => plan.productId === selectedProductId) ??
    planOptions[0] ??
    fallbackPlans[0];

  const getPlanScale = (productId: string) => {
    if (!planScaleByIdRef.current[productId]) {
      planScaleByIdRef.current[productId] = new Animated.Value(1);
    }
    return planScaleByIdRef.current[productId];
  };

  const setPlan = (productId: string) => {
    const planScale = getPlanScale(productId);
    planScale.stopAnimation();
    planScale.setValue(1);
    Animated.sequence([
      Animated.timing(planScale, {
        toValue: 1.018,
        duration: 95,
        useNativeDriver: true,
      }),
      Animated.spring(planScale, {
        toValue: 1,
        speed: 24,
        bounciness: 5,
        useNativeDriver: true,
      }),
    ]).start();
    void Haptics.selectionAsync().catch(() => null);
    setSelectedProductId(productId);
    setFeedback(null);
    logEvent('membership_plan_selected', {
      screen: 'MembershipScreen',
      extra: { productId },
    });
  };

  const handlePurchase = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    setFeedback(null);
    logEvent('membership_continue_pressed', {
      screen: 'MembershipScreen',
      extra: { productId: selectedPlan.productId },
    });
    const result = await purchase(selectedPlan.productId);
    if (result.status === 'purchased') {
      showMembershipActivationNotice({
        productId: selectedPlan.productId,
        planLabel: selectedPlan.title,
      });
      navigation.replace('MembershipActivated');
      logEvent('membership_purchase_success', {
        screen: 'MembershipScreen',
        extra: { productId: selectedPlan.productId },
      });
      return;
    }
    const nextFeedback = toPurchaseFeedback(result);
    setFeedback(nextFeedback);
    logEvent('membership_purchase_feedback_shown', {
      screen: 'MembershipScreen',
      extra: { kind: nextFeedback.kind, status: result.status },
    });
  };

  const handleRestore = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    setFeedback(null);
    const result = await restore();
    const snapshot = await refreshStatus({ silent: true });
    if (result.status === 'purchased') {
      const restoredProductId = snapshot?.subscription?.productId ?? status?.subscription?.productId ?? null;
      const restoredPlan =
        (restoredProductId && planOptions.find((plan) => plan.productId === restoredProductId)?.title) ?? null;
      showMembershipActivationNotice({
        productId: restoredProductId,
        planLabel: restoredPlan,
      });
      navigation.replace('MembershipActivated');
      return;
    }
    setFeedback(toRestoreFeedback(result));
  };

  const handleManageInStore = async () => {
    if (isOpeningManage || isProcessingPurchase) {
      return;
    }
    setFeedback(null);
    setIsOpeningManage(true);
    void Haptics.selectionAsync().catch(() => null);
    const targets = [
      'itms-apps://apps.apple.com/account/subscriptions',
      'https://apps.apple.com/account/subscriptions',
    ];
    try {
      for (const target of targets) {
        try {
          await Linking.openURL(target);
          return;
        } catch {
          continue;
        }
      }
      setFeedback({
        kind: 'failed',
        title: 'Could not open subscriptions',
        detail: 'Open iPhone Settings > Apple Account > Subscriptions to manage billing.',
        tone: 'error',
      });
    } finally {
      setIsOpeningManage(false);
    }
  };

  const retryProducts = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    setFeedback(null);
    logEvent('membership_products_retry_tapped', {
      screen: 'MembershipScreen',
    });
    await refreshProducts();
  };

  useEffect(() => {
    if (!showExitModal) {
      exitBackdropOpacity.setValue(0);
      exitCardOpacity.setValue(0);
      exitCardTranslateY.setValue(10);
      exitCardScale.setValue(0.985);
      return;
    }
    Animated.parallel([
      Animated.timing(exitBackdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(exitCardOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(exitCardTranslateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(exitCardScale, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [exitBackdropOpacity, exitCardOpacity, exitCardScale, exitCardTranslateY, showExitModal]);

  const closeExitModal = () => {
    if (isSigningOut) return;
    void Haptics.selectionAsync().catch(() => null);
    setShowExitModal(false);
  };

  const confirmSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    try {
      await AsyncStorage.setItem(MEMBERSHIP_SIGNOUT_NOTE_KEY, '1');
      await signOut();
      logEvent('membership_signout_not_now', { screen: 'MembershipScreen' });
      setShowExitModal(false);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 0) + 26,
            paddingBottom: footerHeight + 36,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBlock}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="shield-checkmark" size={32} color={theme.colors.accent} />
          </View>
          <Text style={styles.title}>Your family's call protection</Text>
          <Text style={styles.subtitle}>
            Every call screened, every fraud attempt flagged — before it reaches you.
          </Text>
        </View>

        <View style={styles.featuresCard}>
          {FEATURES.map((f) => (
            <View key={f.text} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={f.icon as any} size={16} color={theme.colors.accent} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.planSection}>
          <Text style={styles.planSectionTitle}>Choose your plan</Text>
          {planOptions.map((plan) => {
            const selected = selectedPlan.productId === plan.productId;
            const isAnnual = plan.productId.includes('annual');
            return (
              <Animated.View
                key={plan.productId}
                style={{ transform: [{ scale: getPlanScale(plan.productId) }] }}
              >
                <Pressable
                  style={[styles.planCard, selected && styles.planCardSelected, isAnnual && styles.planCardAnnual]}
                  onPress={() => setPlan(plan.productId)}
                >
                  {/* Annual accent stripe */}
                  {isAnnual && <View style={styles.planAnnualStripe} />}

                  <View style={styles.planMainRow}>
                    <View style={styles.planTextWrap}>
                      <View style={styles.planTitleRow}>
                        <Text style={styles.planTitle}>{plan.title}</Text>
                        {isAnnual && plan.badge ? (
                          <View style={styles.planBestValuePill}>
                            <Text style={styles.planBestValueText}>{plan.badge}</Text>
                          </View>
                        ) : null}
                      </View>
                      {isAnnual ? (
                        <View style={styles.planSavingsPill}>
                          <Ionicons name="pricetag-outline" size={11} color="#92400e" style={{ marginTop: 1 }} />
                          <Text style={styles.planSavingsText}>{plan.detail}</Text>
                        </View>
                      ) : (
                        <Text style={styles.planDetail}>{plan.detail}</Text>
                      )}
                    </View>
                    <View style={styles.planPriceWrap}>
                      <Text style={[styles.planPrice, isAnnual && styles.planPriceAnnual]}>{plan.price}</Text>
                    </View>
                  </View>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <View style={styles.radioInner} /> : null}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <View style={styles.actionsStack}>
          <View style={[styles.actionsInline, !showInviteCodeAction && styles.actionsInlineSingle]}>
            <Pressable
              style={({ pressed }) => [
                styles.inlineButton,
                pressed && styles.inlineButtonPressed,
                isProcessingPurchase && styles.inlineButtonDisabled,
              ]}
              onPress={handleRestore}
              disabled={isProcessingPurchase}
            >
              <Text style={styles.inlineButtonText}>Restore</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.inlineButton,
                pressed && styles.inlineButtonPressed,
                (isProcessingPurchase || isOpeningManage) && styles.inlineButtonDisabled,
              ]}
              onPress={handleManageInStore}
              disabled={isProcessingPurchase || isOpeningManage}
            >
              <Text style={styles.inlineButtonText}>{isOpeningManage ? 'Opening…' : 'Manage'}</Text>
            </Pressable>
          </View>
          {showInviteCodeAction ? (
            <Pressable
              style={({ pressed }) => [
                styles.inlineButtonSecondary,
                pressed && styles.inlineButtonPressed,
                isProcessingPurchase && styles.inlineButtonDisabled,
              ]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                logEvent('membership_invite_code_tapped', {
                  screen: 'MembershipScreen',
                });
                navigation.navigate('OnboardingInviteCode');
              }}
              disabled={isProcessingPurchase}
            >
              <Text style={styles.inlineButtonSecondaryText}>Use invite code</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.learnMoreRow}>
          <Pressable
            style={styles.learnMoreBtn}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => null);
              logEvent('membership_experience_opened', { screen: 'MembershipScreen' });
              navigation.navigate('MembershipExperience');
            }}
          >
            <Ionicons name="sparkles-outline" size={14} color={theme.colors.accent} />
            <Text style={styles.learnMoreText}>See how it works</Text>
          </Pressable>
          <Text style={styles.learnMoreDivider}>·</Text>
          <Pressable
            style={styles.learnMoreBtn}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => null);
              logEvent('membership_why_choose_opened', { screen: 'MembershipScreen' });
              navigation.navigate('WhyChooseVerity');
            }}
          >
            <Ionicons name="trending-up-outline" size={14} color={theme.colors.accent} />
            <Text style={styles.learnMoreText}>Why Verity</Text>
          </Pressable>
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
              navigation.navigate('SupportPortal', { initialResource: 'billing' });
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open billing help"
          >
            <Text style={styles.billingHelpLink}>Billing help</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.supportQuickRow}
          onPress={() => {
            void Haptics.selectionAsync().catch(() => null);
            navigation.navigate('SupportPortal');
          }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={theme.colors.accent} />
          <Text style={styles.supportQuickText}>Need help now? Open support portal.</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
        </Pressable>

        <Pressable
          style={styles.notNowRow}
          onPress={() => {
            void Haptics.selectionAsync().catch(() => null);
            setShowExitModal(true);
          }}
        >
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>

        <View style={styles.legalFooter}>
          <Text style={styles.legalText}>
            Payment charged to your Apple Account at confirmation. Subscription auto-renews unless
            cancelled at least 24 hours before the end of the current period.{' '}
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL(legalVersions.privacyUrl).catch(() => null)}
            >
              Privacy Policy
            </Text>
            {' · '}
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL(legalVersions.termsUrl).catch(() => null)}
            >
              Terms of Use
            </Text>
          </Text>
        </View>

        {(statusError || feedback) ? (
          <View
            style={[
              styles.feedbackCard,
              feedback?.tone === 'info' ? styles.feedbackCardInfo : styles.feedbackCardError,
            ]}
          >
            <Text style={styles.feedbackTitle}>
              {feedback?.title ?? 'Could not load membership status'}
            </Text>
            <Text style={styles.feedbackText}>
              {feedback?.detail ?? statusError ?? 'Please try again.'}
            </Text>
            {feedback?.retryProducts ? (
              <Pressable style={styles.feedbackActionButton} onPress={retryProducts}>
                <Text style={styles.feedbackActionText}>Reload plans</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
        onLayout={(event) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          setFooterHeight((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
        }}
      >
        {plansUnavailable ? (
          <Pressable style={styles.catalogErrorInlineSimple} onPress={retryProducts}>
            <Text numberOfLines={1} style={styles.catalogErrorInlineSimpleText}>
              Could not load App Store plans. Tap to retry.
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={handlePurchase}
          disabled={isProcessingPurchase || isLoadingProducts || plansUnavailable}
        >
          {isProcessingPurchase || isLoadingProducts ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Start Protection</Text>
          )}
        </Pressable>
        <Text style={styles.trustStrip}>
          Secure billing via Apple • Cancel anytime • 3-day grace period
        </Text>
      </View>

      <Modal
        visible={showExitModal}
        transparent
        animationType="none"
        onRequestClose={closeExitModal}
      >
        <View style={styles.exitModalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeExitModal}>
            <Animated.View style={[styles.exitModalBackdrop, { opacity: exitBackdropOpacity }]} />
          </Pressable>
          <Animated.View
            style={[
              styles.exitModalCard,
              {
                opacity: exitCardOpacity,
                transform: [{ translateY: exitCardTranslateY }, { scale: exitCardScale }],
              },
            ]}
          >
            <Text style={styles.exitModalTitle}>Leave for now?</Text>
            <Text style={styles.exitModalBody}>
              You will be signed out and returned to login. Verity membership covers secure call routing,
              screening, recordings, and fraud monitoring infrastructure.
            </Text>
            <View style={styles.exitModalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.exitModalButtonSecondary,
                  pressed && styles.exitModalButtonSecondaryPressed,
                ]}
                onPress={closeExitModal}
                disabled={isSigningOut}
              >
                <Text style={styles.exitModalButtonSecondaryText}>Stay here</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.exitModalButtonPrimary,
                  pressed && styles.exitModalButtonPrimaryPressed,
                  isSigningOut && styles.exitModalButtonPrimaryDisabled,
                ]}
                onPress={confirmSignOut}
                disabled={isSigningOut}
              >
                {isSigningOut ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.exitModalButtonPrimaryText}>Sign out</Text>
                )}
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
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
      paddingTop: 26,
      flexGrow: 1,
      gap: 18,
    },
    headerBlock: {
      gap: 10,
      marginBottom: 4,
      alignItems: 'flex-start',
    },
    heroIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: withOpacity(theme.colors.accent, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
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
    featuresCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    featureIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: withOpacity(theme.colors.accent, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.text,
      lineHeight: 20,
    },
    learnMoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: -4,
    },
    learnMoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 4,
      paddingHorizontal: 6,
    },
    learnMoreText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.accent,
    },
    learnMoreDivider: {
      fontSize: 14,
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
      overflow: 'hidden',
    },
    planCardAnnual: {
      paddingTop: 19,
    },
    planAnnualStripe: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: '#d97706',
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
      gap: 5,
    },
    planTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    planTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.text,
    },
    planBestValuePill: {
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 2,
      backgroundColor: withOpacity('#2d6df6', 0.12),
    },
    planBestValueText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.accent,
      letterSpacing: 0.2,
    },
    planSavingsPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: 'rgba(217, 119, 6, 0.12)',
    },
    planSavingsText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#92400e',
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
    planPriceAnnual: {
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
    actionsStack: {
      gap: 10,
    },
    actionsInlineSingle: {
      justifyContent: 'flex-start',
    },
    inlineButton: {
      flex: 1,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.99 }],
    },
    inlineButtonDisabled: {
      opacity: 0.62,
    },
    inlineButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
      textAlign: 'center',
    },
    inlineButtonSecondary: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: withOpacity(theme.colors.textMuted, 0.12),
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.textMuted, 0.34),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    inlineButtonSecondaryText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
    },
    billingCard: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
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
    supportQuickRow: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.3),
      backgroundColor: withOpacity(theme.colors.accent, 0.09),
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    supportQuickText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text,
    },
    notNowRow: {
      alignSelf: 'center',
      paddingHorizontal: 8,
      paddingVertical: 6,
      marginTop: -2,
      marginBottom: 2,
    },
    notNowText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textMuted,
      textDecorationLine: 'underline',
    },
    legalFooter: {
      marginTop: 16,
      paddingHorizontal: 4,
      paddingBottom: 8,
    },
    legalText: {
      fontSize: 11,
      color: theme.colors.textMuted,
      textAlign: 'center',
      lineHeight: 16,
    },
    legalLink: {
      fontSize: 11,
      color: theme.colors.textMuted,
      textDecorationLine: 'underline',
    },
    feedbackCard: {
      marginTop: 4,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 4,
    },
    feedbackCardError: {
      borderColor: withOpacity(theme.colors.danger, 0.28),
      backgroundColor: withOpacity(theme.colors.danger, 0.1),
    },
    feedbackCardInfo: {
      borderColor: withOpacity(theme.colors.accent, 0.3),
      backgroundColor: withOpacity(theme.colors.accent, 0.1),
    },
    feedbackTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text,
    },
    feedbackText: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textMuted,
    },
    feedbackActionButton: {
      marginTop: 3,
      alignSelf: 'flex-start',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.4),
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    feedbackActionText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.accent,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 24,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: withOpacity(theme.colors.bg, 0.98),
    },
    catalogErrorInlineSimple: {
      marginBottom: 10,
      borderRadius: 12,
      backgroundColor: withOpacity(theme.colors.accent, 0.09),
      paddingVertical: 9,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catalogErrorInlineSimpleText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.accent,
      textAlign: 'center',
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
    trustStrip: {
      marginTop: 9,
      fontSize: 11.5,
      lineHeight: 16,
      textAlign: 'center',
      color: theme.colors.textMuted,
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
    exitModalRoot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    exitModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: withOpacity(theme.colors.bg, 0.72),
    },
    exitModalCard: {
      width: '100%',
      maxWidth: 370,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 18,
      paddingVertical: 18,
      gap: 10,
      shadowColor: '#000',
      shadowOpacity: 0.24,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    exitModalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    exitModalBody: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    exitModalActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    exitModalButtonSecondary: {
      flex: 1,
      minHeight: 46,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exitModalButtonSecondaryPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.99 }],
    },
    exitModalButtonSecondaryText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
    exitModalButtonPrimary: {
      flex: 1,
      minHeight: 46,
      borderRadius: 14,
      backgroundColor: theme.colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    exitModalButtonPrimaryPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.99 }],
    },
    exitModalButtonPrimaryDisabled: {
      opacity: 0.75,
    },
    exitModalButtonPrimaryText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#fff',
    },
  });
