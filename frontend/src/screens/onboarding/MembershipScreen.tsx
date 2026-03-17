import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  PanResponder,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
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
import { validateFacilityOfferCode } from '../../services/facilityOffers';

type PlanOption = {
  productId: string;
  title: string;
  price: string;
  detail: string;
  badge?: string;
  hasFreeTrial?: boolean;
  trialLabel?: string | null;
  ctaLabel?: string;
};

type MembershipFeedback = {
  kind: 'product_not_found' | 'network' | 'cancelled' | 'pending' | 'failed';
  title: string;
  detail: string;
  tone: 'error' | 'info';
  retryProducts?: boolean;
};

type HeroSlide = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle: string;
  accent?: boolean;
};

const fallbackPlans: PlanOption[] = [
  {
    productId: 'verityprotect_monthly',
    title: 'Monthly',
    price: '$9.99 / month',
    detail: '$9.99 a month',
    hasFreeTrial: true,
    trialLabel: '7-day free trial',
  },
  {
    productId: 'verityprotect_annual',
    title: 'Annual',
    price: '$99.99 / year',
    detail: 'Save 17% vs monthly',
    badge: 'Best Value',
  },
  {
    productId: 'verityprotect_facility_annual',
    title: 'Verity Protect Facility',
    price: 'Included',
    detail: 'Provided by your community',
    badge: 'Partner',
    hasFreeTrial: true,
    trialLabel: '14-day free trial',
    ctaLabel: 'Activate Protection',
  },
];

const FACILITY_PRODUCT_ID = 'verityprotect_facility_annual';
const FACILITY_CODE_LENGTH = 16;
function toPlanOption(product: {
  productId: string;
  displayName: string;
  displayPrice: string;
  subscriptionPeriodUnit?: string | null;
  hasFreeTrial?: boolean | null;
  introOfferPeriodUnit?: string | null;
  introOfferPeriodCount?: number | null;
}): PlanOption {
  const normalizedUnit = (product.subscriptionPeriodUnit ?? '').toLowerCase();
  const suffix =
    normalizedUnit === 'year'
      ? ' / year'
      : normalizedUnit === 'month'
        ? ' / month'
        : '';

  const introPeriodCount =
    typeof product.introOfferPeriodCount === 'number' && Number.isFinite(product.introOfferPeriodCount)
      ? product.introOfferPeriodCount
      : null;
  const introPeriodUnit = (product.introOfferPeriodUnit ?? '').toLowerCase();
  const normalizedIntroUnit =
    introPeriodUnit === 'day' || introPeriodUnit === 'week' || introPeriodUnit === 'month' || introPeriodUnit === 'year'
      ? introPeriodUnit
      : null;
  const hasFreeTrial = Boolean(product.hasFreeTrial);
  const trialDurationLabel =
    hasFreeTrial && introPeriodCount && normalizedIntroUnit
      ? `${introPeriodCount}-${normalizedIntroUnit} free trial`
      : hasFreeTrial
        ? 'Free trial'
        : null;

  const isAnnual = product.productId === 'verityprotect_annual';
  const isFacility = product.productId === FACILITY_PRODUCT_ID;
  if (isFacility) {
    return {
      productId: product.productId,
      title: 'Verity Protect Facility',
      price: 'Included',
      detail: 'Provided by your community',
      badge: 'Partner',
      hasFreeTrial: true,
      trialLabel:
        hasFreeTrial && introPeriodCount && normalizedIntroUnit
          ? `${introPeriodCount}-${normalizedIntroUnit} free trial`
          : '14-day free trial',
      ctaLabel: 'Activate Protection',
    };
  }
  const detail = isAnnual
    ? 'Save 17% vs monthly'
    : `${product.displayPrice} a month`;

  return {
    productId: product.productId,
    title: product.displayName || (isAnnual ? 'Annual' : 'Monthly'),
    price: `${product.displayPrice}${suffix}`,
    detail,
    badge: isAnnual ? 'Best Value' : undefined,
    hasFreeTrial,
    trialLabel: trialDurationLabel,
    ctaLabel: hasFreeTrial ? 'Start Free Trial' : 'Start Protection',
  };
}

function normalizeFacilityCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, FACILITY_CODE_LENGTH);
}

function formatFacilityCode(value: string) {
  const compact = normalizeFacilityCode(value);
  if (compact.length <= 4) {
    return compact;
  }
  const chunks = compact.match(/.{1,4}/g);
  return chunks ? chunks.join('-') : compact;
}

function isFacilityPlan(productId?: string | null) {
  return productId === FACILITY_PRODUCT_ID;
}

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
  const { theme, mode } = useTheme();
  const styles = useMemo(() => createMembershipStyles(theme, mode), [mode, theme]);
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
  const [footerHeight, setFooterHeight] = useState(156);
  const [showExitModal, setShowExitModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [facilityCode, setFacilityCode] = useState('');
  const [facilityError, setFacilityError] = useState<string | null>(null);
  const [isFacilityValidating, setIsFacilityValidating] = useState(false);
  const [validatedFacility, setValidatedFacility] = useState<{
    code: string;
    facilityName: string;
    headline: string;
  } | null>(null);
  const [legalVersions, setLegalVersions] = useState(FALLBACK_LEGAL_VERSIONS);
  useEffect(() => {
    fetchCurrentLegalVersions().then(setLegalVersions).catch(() => null);
  }, []);
  const exitBackdropOpacity = useRef(new Animated.Value(0)).current;
  const exitCardOpacity = useRef(new Animated.Value(0)).current;
  const exitCardTranslateY = useRef(new Animated.Value(10)).current;
  const exitCardScale = useRef(new Animated.Value(0.985)).current;
  const trialCtaScale = useRef(new Animated.Value(1)).current;
  const feedbackCardOpacity = useRef(new Animated.Value(0)).current;
  const feedbackCardTranslateY = useRef(new Animated.Value(8)).current;
  const heroIconOpacity = useRef(new Animated.Value(1)).current;
  const heroIconTranslateY = useRef(new Animated.Value(0)).current;
  const heroIconScale = useRef(new Animated.Value(1)).current;
  const heroTextOpacity = useRef(new Animated.Value(1)).current;
  const heroTextTranslateY = useRef(new Animated.Value(0)).current;
  const heroProgressValues = useRef(
    Array.from({ length: 4 }, (_, index) => new Animated.Value(index === 0 ? 1 : 0))
  ).current;
  const isHeroTransitioningRef = useRef(false);
  const planScaleByIdRef = useRef<Record<string, Animated.Value>>({});
  const hasLoggedMembershipView = useRef(false);
  const hasAutoCompletedActivationRef = useRef(false);
  const showInviteCodeAction = status?.canJoinWithInviteCode !== false;
  const plansUnavailable = !isLoadingProducts && products.length === 0;
  const [heroIndex, setHeroIndex] = useState(0);

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

  useEffect(() => {
    if (hasAutoCompletedActivationRef.current) {
      return;
    }
    if (!status?.hasActiveSubscription || isProcessingPurchase) {
      return;
    }

    hasAutoCompletedActivationRef.current = true;
    const resolvedProductId =
      status.subscription?.productId ??
      selectedProductId ??
      selectedDefaultProductId;
    const resolvedPlanLabel =
      planOptions.find((plan) => plan.productId === resolvedProductId)?.title ?? null;
    showMembershipActivationNotice({
      productId: resolvedProductId ?? null,
      planLabel: resolvedPlanLabel,
    });
    navigation.replace('MembershipActivated');
  }, [
    isProcessingPurchase,
    navigation,
    planOptions,
    selectedProductId,
    selectedDefaultProductId,
    showMembershipActivationNotice,
    status?.hasActiveSubscription,
    status?.subscription?.productId,
  ]);

  const selectedPlan =
    planOptions.find((plan) => plan.productId === selectedProductId) ??
    planOptions[0] ??
    fallbackPlans[0];
  const facilityPlan =
    planOptions.find((plan) => plan.productId === FACILITY_PRODUCT_ID) ??
    fallbackPlans.find((plan) => plan.productId === FACILITY_PRODUCT_ID) ??
    null;
  const isFacilitySelected = isFacilityPlan(selectedPlan?.productId);
  const facilityDisplayPrice = useMemo(() => {
    const storeProduct = products.find((product) => product.productId === FACILITY_PRODUCT_ID);
    return storeProduct?.displayPrice ?? '$74.99';
  }, [products]);

  const heroSlides = useMemo<HeroSlide[]>(
    () => [
      {
        id: 'problem',
        icon: 'alert-circle-outline',
        iconColor: theme.colors.danger,
        title: 'The Problem',
        subtitle: 'Scammers keep dialing your family. Each time, they sound urgent and real.',
      },
      {
        id: 'solution',
        icon: 'shield-outline',
        iconColor: theme.colors.accent,
        title: 'The Solution',
        subtitle: 'Verity answers first, filters risk, and only lets trusted people through.',
      },
      {
        id: 'payoff',
        icon: 'shield-checkmark-outline',
        iconColor: theme.colors.success,
        title: 'The Payoff',
        subtitle: 'You stay informed, they stay independent, and worry stops here.',
      },
      {
        id: 'ready',
        icon: 'shield-checkmark-outline',
        iconColor: theme.colors.accent,
        title: 'Ready to protect your family?',
        subtitle: 'Select your plan below.',
      },
    ],
    [theme.colors.accent, theme.colors.danger, theme.colors.success]
  );
  const activeHeroSlide = heroSlides[heroIndex] ?? heroSlides[0];

  const heroEasing = useMemo(() => Easing.bezier(0.32, 1, 0.2, 1), []);

  const animateHeroEntrance = useMemo(
    () => (nextIndex: number) => {
      Animated.parallel([
        Animated.timing(heroIconOpacity, {
          toValue: 1,
          duration: 860,
          easing: heroEasing,
          useNativeDriver: true,
        }),
        Animated.timing(heroIconTranslateY, {
          toValue: 0,
          duration: 920,
          easing: heroEasing,
          useNativeDriver: true,
        }),
        Animated.timing(heroIconScale, {
          toValue: 1,
          duration: 920,
          easing: heroEasing,
          useNativeDriver: true,
        }),
        Animated.timing(heroTextOpacity, {
          toValue: 1,
          duration: 860,
          delay: 100,
          easing: heroEasing,
          useNativeDriver: true,
        }),
        Animated.timing(heroTextTranslateY, {
          toValue: 0,
          duration: 920,
          delay: 100,
          easing: heroEasing,
          useNativeDriver: true,
        }),
      ]).start(() => {
        isHeroTransitioningRef.current = false;
      });
    },
    [
      heroEasing,
      heroIconOpacity,
      heroIconScale,
      heroIconTranslateY,
      heroTextOpacity,
      heroTextTranslateY,
    ]
  );

  const transitionHeroTo = useMemo(
    () => (nextIndex: number) => {
      if (nextIndex === heroIndex || isHeroTransitioningRef.current) {
        return;
      }

      isHeroTransitioningRef.current = true;
      Animated.parallel([
        Animated.timing(heroIconOpacity, {
          toValue: 0,
          duration: 280,
          easing: heroEasing,
          useNativeDriver: true,
        }),
        Animated.timing(heroIconTranslateY, {
          toValue: -12,
          duration: 360,
          easing: heroEasing,
          useNativeDriver: true,
        }),
        Animated.timing(heroTextOpacity, {
          toValue: 0,
          duration: 260,
          easing: heroEasing,
          useNativeDriver: true,
        }),
        Animated.timing(heroTextTranslateY, {
          toValue: -20,
          duration: 360,
          easing: heroEasing,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) {
          isHeroTransitioningRef.current = false;
          return;
        }

        heroIconOpacity.setValue(0);
        heroIconTranslateY.setValue(20);
        heroIconScale.setValue(0.96);
        heroTextOpacity.setValue(0);
        heroTextTranslateY.setValue(20);
        setHeroIndex(nextIndex);
        animateHeroEntrance(nextIndex);
      });
    },
    [
      animateHeroEntrance,
      heroEasing,
      heroIconOpacity,
      heroIconScale,
      heroIconTranslateY,
      heroIndex,
      heroTextOpacity,
      heroTextTranslateY,
    ]
  );

  const advanceHero = useCallback((direction: 'next' | 'prev') => {
    const nextIndex =
      direction === 'next'
        ? (heroIndex + 1) % heroSlides.length
        : heroIndex === 0
          ? heroSlides.length - 1
          : heroIndex - 1;
    transitionHeroTo(nextIndex);
  }, [heroIndex, heroSlides.length, transitionHeroTo]);

  useEffect(() => {
    heroIconOpacity.setValue(0);
    heroIconTranslateY.setValue(20);
    heroIconScale.setValue(0.92);
    heroTextOpacity.setValue(0);
    heroTextTranslateY.setValue(20);
    animateHeroEntrance(heroIndex);
  }, [
    animateHeroEntrance,
    heroIconOpacity,
    heroIconScale,
    heroIconTranslateY,
    heroIndex,
    heroTextOpacity,
    heroTextTranslateY,
  ]);

  useEffect(() => {
    Animated.parallel(
      heroProgressValues.map((value, index) =>
        Animated.timing(value, {
          toValue: index === heroIndex ? 1 : 0,
          duration: 800,
          easing: heroEasing,
          useNativeDriver: false,
        })
      )
    ).start();
  }, [heroEasing, heroIndex, heroProgressValues]);

  useEffect(() => {
    const timer = setInterval(() => {
      advanceHero('next');
    }, 4800);

    return () => clearInterval(timer);
  }, [advanceHero]);

  useEffect(() => {
    if (
      !selectedPlan?.productId ||
      isProcessingPurchase ||
      isLoadingProducts ||
      plansUnavailable
    ) {
      trialCtaScale.stopAnimation();
      trialCtaScale.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(trialCtaScale, {
          toValue: 1.018,
          duration: 550,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(trialCtaScale, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(1900),
      ])
    );
    pulse.start();

    return () => {
      pulse.stop();
      trialCtaScale.stopAnimation();
      trialCtaScale.setValue(1);
    };
  }, [
    isLoadingProducts,
    isProcessingPurchase,
    plansUnavailable,
    selectedPlan?.productId,
    trialCtaScale,
  ]);

  useEffect(() => {
    if (!feedback && !statusError) {
      feedbackCardOpacity.setValue(0);
      feedbackCardTranslateY.setValue(8);
      return;
    }

    Animated.parallel([
      Animated.timing(feedbackCardOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(feedbackCardTranslateY, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [feedback, statusError, feedbackCardOpacity, feedbackCardTranslateY]);

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
    if (isFacilitySelected) {
      setFeedback(null);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
      logEvent('membership_facility_modal_opened', {
        screen: 'MembershipScreen',
      });
      navigation.navigate('MembershipFacilityOffer');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    setFeedback(null);
    logEvent('membership_continue_pressed', {
      screen: 'MembershipScreen',
      extra: { productId: selectedPlan.productId, hasFreeTrial: Boolean(selectedPlan.hasFreeTrial) },
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
        extra: { productId: selectedPlan.productId, hasFreeTrial: Boolean(selectedPlan.hasFreeTrial) },
      });
      if (selectedPlan.hasFreeTrial) {
        logEvent('membership_trial_started', {
          screen: 'MembershipScreen',
          extra: { productId: selectedPlan.productId },
        });
      }
      return;
    }
    const nextFeedback = toPurchaseFeedback(result);
    setFeedback(nextFeedback);
    void Haptics.notificationAsync(
      nextFeedback.tone === 'error'
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Warning
    ).catch(() => null);
    logEvent('membership_purchase_feedback_shown', {
      screen: 'MembershipScreen',
      extra: { kind: nextFeedback.kind, status: result.status },
    });
  };

  const closeFacilityModal = () => {
    if (isProcessingPurchase || isFacilityValidating) {
      return;
    }
    void Haptics.selectionAsync().catch(() => null);
    setShowFacilityModal(false);
  };

  const handleFacilityCodeChange = (text: string) => {
    setFacilityCode(normalizeFacilityCode(text));
    if (facilityError) {
      setFacilityError(null);
    }
  };

  const handleFacilityValidate = async () => {
    const normalizedCode = normalizeFacilityCode(facilityCode);
    if (normalizedCode.length < 6) {
      setFacilityError('Enter the code from your brochure or community QR page.');
      return;
    }

    setFacilityError(null);
    setIsFacilityValidating(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);

    try {
      const response = await validateFacilityOfferCode(normalizedCode);
      setValidatedFacility({
        code: response.code,
        facilityName: response.facility.name,
        headline: 'Partner pricing unlocked',
      });
      setIsFacilityValidating(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      logEvent('membership_facility_code_validated', {
        screen: 'MembershipScreen',
        extra: { facilityName: response.facility.name },
      });
    } catch (error) {
      setValidatedFacility(null);
      setFacilityError(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'That code was not recognized. Double-check the brochure code and try again.'
      );
      setIsFacilityValidating(false);
    }
  };

  const handleFacilityPurchase = async () => {
    if (!validatedFacility || !facilityPlan) {
      return;
    }

    setFacilityError(null);
    setFeedback(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    logEvent('membership_facility_claim_pressed', {
      screen: 'MembershipScreen',
      extra: { facilityName: validatedFacility.facilityName, code: validatedFacility.code },
    });

    const result = await purchase(FACILITY_PRODUCT_ID, {
      facilityCode: validatedFacility.code,
    });
    if (result.status === 'purchased') {
      showMembershipActivationNotice({
        productId: FACILITY_PRODUCT_ID,
        planLabel: facilityPlan.title,
      });
      setShowFacilityModal(false);
      navigation.replace('MembershipActivated');
      logEvent('membership_purchase_success', {
        screen: 'MembershipScreen',
        extra: { productId: FACILITY_PRODUCT_ID, facilityName: validatedFacility.facilityName },
      });
      logEvent('membership_trial_started', {
        screen: 'MembershipScreen',
        extra: { productId: FACILITY_PRODUCT_ID },
      });
      return;
    }

    const nextFeedback = toPurchaseFeedback(result);
    setFacilityError(nextFeedback.detail);
    void Haptics.notificationAsync(
      nextFeedback.tone === 'error'
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Warning
    ).catch(() => null);
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
    const nextFeedback = toRestoreFeedback(result);
    setFeedback(nextFeedback);
    void Haptics.notificationAsync(
      nextFeedback.tone === 'error'
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Warning
    ).catch(() => null);
  };

  const retryProducts = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    setFeedback(null);
    logEvent('membership_products_retry_tapped', {
      screen: 'MembershipScreen',
    });
    await refreshProducts();
  };
  const heroPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx <= -40) {
            advanceHero('next');
          } else if (gestureState.dx >= 40) {
            advanceHero('prev');
          }
        },
        onPanResponderTerminate: () => null,
      }),
    [advanceHero]
  );

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
            paddingTop: 0,
            paddingBottom: footerHeight + 36,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.heroCard,
            activeHeroSlide.accent && styles.heroCardAccent,
            {
              paddingTop: Math.max(insets.top, 0) + 34,
            },
          ]}
          {...heroPanResponder.panHandlers}
        >
          <View style={styles.heroSlide}>
            <View style={styles.heroCardTop}>
              <Animated.View
                style={{
                  opacity: heroIconOpacity,
                  transform: [{ translateY: heroIconTranslateY }, { scale: heroIconScale }],
                }}
              >
                <View style={[styles.heroIconWrap, activeHeroSlide.accent && styles.heroIconWrapAccent]}>
                  <Ionicons
                    name={activeHeroSlide.icon}
                    size={36}
                    color={activeHeroSlide.iconColor}
                  />
                </View>
              </Animated.View>
            </View>
            <Animated.View
              style={[
                styles.heroTextWrap,
                {
                  opacity: heroTextOpacity,
                  transform: [{ translateY: heroTextTranslateY }],
                },
              ]}
            >
                <Text style={[styles.title, activeHeroSlide.accent && styles.titleAccent]}>
                  {activeHeroSlide.title}
                </Text>
                <Text style={[styles.subtitle, activeHeroSlide.accent && styles.subtitleAccent]}>
                  {activeHeroSlide.subtitle}
                </Text>
            </Animated.View>
          </View>
          <View style={styles.heroFooter}>
            <View style={styles.heroProgressCentered}>
              <View style={styles.heroProgress}>
                {heroSlides.map((slide, index) => {
                  const animatedSegmentStyle = {
                    width: heroProgressValues[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [6, 26],
                    }),
                    backgroundColor: heroProgressValues[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [
                        withOpacity(theme.colors.textMuted, 0.28),
                        theme.colors.accent,
                      ],
                    }),
                  };

                  return (
                  <Pressable
                    key={slide.id}
                    style={styles.heroProgressSegmentPressable}
                    onPress={() => transitionHeroTo(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${slide.title}`}
                  >
                    <Animated.View style={[styles.heroProgressSegment, animatedSegmentStyle]} />
                  </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </Animated.View>

        <View style={styles.bodySection}>
          <View style={styles.heroLinkGrid}>
          <Pressable
            style={({ pressed }) => [styles.heroLinkCard, pressed && styles.inlineButtonPressed]}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => null);
              logEvent('membership_experience_opened', { screen: 'MembershipScreen' });
              navigation.navigate('MembershipExperience');
            }}
          >
            <Ionicons name="call-outline" size={16} color={theme.colors.accent} />
            <View style={styles.heroLinkBottomRow}>
              <Text style={styles.heroLinkTitle}>How It Works</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.heroLinkCard, pressed && styles.inlineButtonPressed]}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => null);
              logEvent('membership_why_choose_opened', { screen: 'MembershipScreen' });
              navigation.navigate('WhyChooseVerity');
            }}
          >
            <Ionicons name="information-circle-outline" size={16} color={theme.colors.accent} />
            <View style={styles.heroLinkBottomRow}>
              <Text style={styles.heroLinkTitle}>Why Verity?</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>
        </View>

          <View style={styles.planSection}>
            <Text style={styles.planSectionTitle}>Choose your plan</Text>
            {planOptions.map((plan) => {
              const selected = selectedPlan.productId === plan.productId;
              const isAnnual = plan.productId.includes('annual');
              const planPrice = isFacilityPlan(plan.productId)
                ? 'Included'
                : isAnnual
                  ? '$99.99'
                  : '$9.99';
              const planUnit = isFacilityPlan(plan.productId) ? null : isAnnual ? '/yr' : '/mo';
              const planSubdetail = isFacilityPlan(plan.productId)
                ? 'Provided by your community'
                : isAnnual
                  ? 'Save 17% ($8.33/mo)'
                  : '7-day free trial included';
              return (
                <Animated.View
                  key={plan.productId}
                  style={{ transform: [{ scale: getPlanScale(plan.productId) }] }}
                >
                  <Pressable
                    style={[styles.planCard, selected && styles.planCardSelected]}
                    onPress={() => setPlan(plan.productId)}
                  >
                    <View style={styles.planMainRow}>
                      <View style={styles.planTextWrap}>
                        <View style={styles.planTitleWrap}>
                          <View style={styles.planTitleRow}>
                            <Text style={styles.planTitle}>{plan.title}</Text>
                            {plan.badge && !isAnnual ? (
                              <View
                                style={[
                                  styles.planBestValuePill,
                                  isFacilityPlan(plan.productId) && styles.planPartnerPill,
                                ]}
                              >
                                <Text style={styles.planBestValueText}>{plan.badge}</Text>
                              </View>
                            ) : null}
                          </View>
                          {plan.badge && isAnnual ? (
                            <View style={styles.planBadgeRow}>
                              <View style={styles.planBestValuePill}>
                                <Text style={styles.planBestValueText}>{plan.badge}</Text>
                              </View>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.planPriceLine}>
                          <Text style={styles.planPrice}>{planPrice}</Text>
                          {planUnit ? <Text style={styles.planPriceUnit}>{planUnit}</Text> : null}
                        </View>
                        <Text style={styles.planDetail}>{planSubdetail}</Text>
                      </View>
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected ? <View style={styles.radioInner} /> : null}
                      </View>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>

          <View style={styles.legalFooter}>
            <Text style={styles.legalText}>
              {selectedPlan?.hasFreeTrial
                ? 'No charge during the free trial. When the trial ends, your Apple Account is charged unless cancelled at least 24 hours before renewal.'
                : 'Payment charged to your Apple Account at confirmation. Subscription auto-renews unless cancelled at least 24 hours before the end of the current period.'}
            </Text>
            <View style={styles.legalMetaRow}>
              <Pressable onPress={handleRestore} disabled={isProcessingPurchase}>
                <Text style={styles.legalMetaLink}>Restore Purchases</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => null);
                  navigation.navigate('SupportPortal');
                }}
              >
                <Text style={styles.legalMetaLink}>Contact Support</Text>
              </Pressable>
            </View>
            <View style={styles.legalPolicyRow}>
              <Pressable onPress={() => Linking.openURL(legalVersions.privacyUrl).catch(() => null)}>
                <Text style={styles.legalLink}>Privacy Policy</Text>
              </Pressable>
              <Text style={styles.legalPolicyDivider}>·</Text>
              <Pressable onPress={() => Linking.openURL(legalVersions.termsUrl).catch(() => null)}>
                <Text style={styles.legalLink}>Terms of Use</Text>
              </Pressable>
            </View>
          </View>

          {(statusError || feedback) ? (
            <Animated.View
              style={[
                styles.feedbackCard,
                feedback?.tone === 'info' ? styles.feedbackCardInfo : styles.feedbackCardError,
                {
                  opacity: feedbackCardOpacity,
                  transform: [{ translateY: feedbackCardTranslateY }],
                },
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
            </Animated.View>
          ) : null}
        </View>
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

        <Animated.View style={{ transform: [{ scale: trialCtaScale }] }}>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            onPress={handlePurchase}
            disabled={isProcessingPurchase || isLoadingProducts || plansUnavailable}
          >
            {isProcessingPurchase || isLoadingProducts ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isFacilitySelected
                  ? selectedPlan?.ctaLabel ?? 'Activate Protection'
                  : selectedPlan?.ctaLabel ??
                    (selectedPlan?.hasFreeTrial ? 'Start Free Trial' : 'Start Protection')}
              </Text>
            )}
          </Pressable>
        </Animated.View>
        {showInviteCodeAction ? (
          <Pressable
            style={({ pressed }) => [
              styles.footerSecondaryButton,
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
            <Text style={styles.footerSecondaryButtonText}>Have an invite code?</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
        <Text style={styles.trustStrip}>
          {isFacilitySelected
            ? 'Community plan • Code required • Secure billing via Apple'
            : selectedPlan?.hasFreeTrial
              ? '7-day free trial • Secure billing via Apple • Cancel anytime'
              : 'Secure billing via Apple • Cancel anytime • 3-day grace period'}
        </Text>
      </View>

      <Modal
        visible={showFacilityModal}
        animationType="slide"
        onRequestClose={closeFacilityModal}
      >
        <SafeAreaView style={styles.facilityScreen} edges={[]}>
          <View style={[styles.facilityHeaderRow, { paddingTop: Math.max(insets.top, 14) }]}>
            <Pressable
              style={styles.facilityBackButton}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => null);
                closeFacilityModal();
              }}
            >
              <Ionicons name="chevron-down" size={18} color={theme.colors.text} />
            </Pressable>
            <Text style={styles.facilityHeaderTitle}>Facility Partner</Text>
            <View style={styles.facilityHeaderSpacer} />
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.facilityContent,
              { paddingBottom: Math.max(insets.bottom, 24) + 172 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.facilityIntroBlock}>
              <Text style={styles.facilitySheetEyebrow}>Community partner plan</Text>
              <Text style={styles.facilitySheetTitle}>Activate your facility offer</Text>
              <Text style={styles.facilitySheetSubtitle}>
                Enter the code from your brochure or QR page to unlock your community pricing.
              </Text>
            </View>

            <View style={styles.facilityHeroCard}>
              <View style={styles.facilityHeroIcon}>
                <Ionicons name="business-outline" size={22} color={theme.colors.accent} />
              </View>
              <View style={styles.facilityHeroBody}>
                <Text style={styles.facilityHeroTitle}>
                  {validatedFacility?.headline ?? 'Reserved for partner residents'}
                </Text>
                <Text style={styles.facilityHeroCopy}>
                  {validatedFacility
                    ? `Residents of ${validatedFacility.facilityName} can start with a 14-day free trial, then continue at ${facilityDisplayPrice}/year.`
                    : 'This plan stays behind a valid facility code so only partner residents can claim it.'}
                </Text>
              </View>
            </View>

            <View style={styles.facilityInputGroup}>
              <Text style={styles.facilityInputLabel}>Facility code</Text>
              <View style={styles.facilityInputWrap}>
                <Ionicons name="key-outline" size={18} color={theme.colors.textMuted} />
                <TextInput
                  style={styles.facilityInput}
                  placeholder="Enter facility code"
                  placeholderTextColor={withOpacity(theme.colors.textMuted, 0.55)}
                  value={formatFacilityCode(facilityCode)}
                  onChangeText={handleFacilityCodeChange}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!isFacilityValidating && !isProcessingPurchase}
                  returnKeyType="done"
                />
              </View>
              <Text style={styles.facilityInputHint}>
                Found on your printed brochure or the page opened from your facility QR code.
              </Text>
            </View>

            {facilityError ? (
              <View style={styles.facilityErrorCard}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.colors.danger} />
                <Text style={styles.facilityErrorText}>{facilityError}</Text>
              </View>
            ) : null}

            {validatedFacility ? (
              <View style={styles.facilityOfferCard}>
                <Text style={styles.facilityOfferEyebrow}>Eligible offer</Text>
                <Text style={styles.facilityOfferTitle}>{validatedFacility.facilityName}</Text>
                <View style={styles.facilityOfferRow}>
                  <Ionicons name="sparkles-outline" size={16} color={theme.colors.accent} />
                  <Text style={styles.facilityOfferText}>14-day free trial included</Text>
                </View>
                <View style={styles.facilityOfferRow}>
                  <Ionicons name="card-outline" size={16} color={theme.colors.accent} />
                  <Text style={styles.facilityOfferText}>Then {facilityDisplayPrice}/year through Apple billing</Text>
                </View>
                <View style={styles.facilityOfferRow}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.accent} />
                  <Text style={styles.facilityOfferText}>Available only to partner residents with this code</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.facilityFooter,
              {
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
          >
            {!validatedFacility ? (
              <Pressable
                style={({ pressed }) => [
                  styles.facilityPrimaryButton,
                  pressed && styles.primaryButtonPressed,
                  isFacilityValidating && styles.inlineButtonDisabled,
                ]}
                onPress={handleFacilityValidate}
                disabled={isFacilityValidating}
              >
                {isFacilityValidating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Verify Code</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.facilityPrimaryButton,
                  pressed && styles.primaryButtonPressed,
                  (isProcessingPurchase || isLoadingProducts) && styles.inlineButtonDisabled,
                ]}
                onPress={handleFacilityPurchase}
                disabled={isProcessingPurchase || isLoadingProducts}
              >
                {isProcessingPurchase ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Claim Facility Offer</Text>
                )}
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.facilitySecondaryButton,
                pressed && styles.inlineButtonPressed,
              ]}
              onPress={validatedFacility ? () => setValidatedFacility(null) : closeFacilityModal}
              disabled={isFacilityValidating || isProcessingPurchase}
            >
              <Text style={styles.facilitySecondaryButtonText}>
                {validatedFacility ? 'Enter a different code' : 'Close'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showExitModal}
        transparent
        animationType="none"
        onRequestClose={closeExitModal}
      >
        <View style={styles.exitModalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeExitModal}>
            <Animated.View style={[styles.exitModalBackdropAnimatedLayer, { opacity: exitBackdropOpacity }]}>
              <BlurView intensity={65} tint={mode === 'dark' ? 'dark' : 'light'} style={styles.exitModalBackdropBlur} />
              <View style={styles.exitModalBackdropScrim} />
            </Animated.View>
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

const createMembershipStyles = (theme: AppTheme, mode?: 'light' | 'dark' | string) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    content: {
      paddingHorizontal: 32,
      paddingTop: 24,
      flexGrow: 1,
      gap: 32,
    },
    bodySection: {
      marginHorizontal: -32,
      backgroundColor: theme.colors.bg,
      paddingHorizontal: 32,
      paddingTop: 16,
      gap: 32,
    },
    heroCard: {
      marginHorizontal: -32,
      backgroundColor: theme.colors.bg,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingHorizontal: 32,
      paddingTop: 34,
      paddingBottom: 10,
      minHeight: 404,
      justifyContent: 'space-between',
      overflow: 'hidden',
    },
    heroCardAccent: {
      backgroundColor: theme.colors.accent,
      borderBottomColor: withOpacity('#FFFFFF', 0.16),
    },
    heroPager: {
      flexGrow: 0,
    },
    heroSlide: {
      justifyContent: 'flex-start',
      alignItems: 'center',
      minHeight: 286,
    },
    heroIconWrap: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: withOpacity(theme.colors.text, 0.02),
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.textMuted, 0.2),
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    heroIconWrapAccent: {
      backgroundColor: withOpacity('#FFFFFF', 0.08),
      borderColor: withOpacity('#FFFFFF', 0.22),
    },
    heroCardTop: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 8,
      marginTop: 0,
    },
    heroTextWrap: {
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 4,
      marginTop: 18,
      minHeight: 108,
      justifyContent: 'flex-start',
    },
    title: {
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: theme.colors.text,
      lineHeight: 40,
      textAlign: 'center',
    },
    titleAccent: {
      color: '#FFFFFF',
    },
    subtitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.textMuted,
      lineHeight: 26,
      textAlign: 'center',
      minHeight: 52,
      maxWidth: 280,
    },
    subtitleAccent: {
      color: withOpacity('#FFFFFF', 0.82),
    },
    heroFooter: {
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 28,
    },
    heroProgressCentered: {
      minHeight: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroProgress: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      justifyContent: 'center',
    },
    heroProgressSegmentPressable: {
      paddingVertical: 4,
    },
    heroProgressSegment: {
      minWidth: 6,
      height: 6,
      borderRadius: 999,
    },
    heroLinkGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    heroLinkCard: {
      flex: 1,
      minHeight: 96,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      justifyContent: 'flex-start',
    },
    heroLinkTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      lineHeight: 20,
    },
    heroLinkBottomRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 'auto',
    },
    planSection: {
      gap: 8,
    },
    planSectionTitle: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
    },
    planCard: {
      borderRadius: 32,
      paddingHorizontal: 16,
      paddingVertical: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
      marginBottom: 8,
    },
    planCardSelected: {
      borderWidth: 2,
      borderColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    planMainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 86,
    },
    planTextWrap: {
      flex: 1,
      justifyContent: 'space-between',
      gap: 10,
    },
    planTitleWrap: {
      gap: 8,
    },
    planTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'nowrap',
    },
    planBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    planTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
      flexShrink: 1,
      lineHeight: 22,
    },
    planBestValuePill: {
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 5,
      backgroundColor: withOpacity(theme.colors.accent, 0.16),
    },
    planPartnerPill: {
      backgroundColor: withOpacity(theme.colors.accent, 0.18),
    },
    planBestValueText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.accent,
      letterSpacing: 0.2,
    },
    planPriceLine: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 4,
    },
    planPrice: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
      lineHeight: 30,
    },
    planPriceUnit: {
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '600',
      color: theme.colors.textMuted,
      marginBottom: 3,
    },
    planDetail: {
      fontSize: 14,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: withOpacity(theme.colors.textMuted, 0.45),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
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
    inlineButtonPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.99 }],
    },
    inlineButtonDisabled: {
      opacity: 0.62,
    },
    legalFooter: {
      marginTop: -8,
      paddingHorizontal: 4,
      gap: 8,
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
    legalPolicyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      flexWrap: 'nowrap',
    },
    legalPolicyDivider: {
      fontSize: 11,
      color: theme.colors.textMuted,
    },
    legalMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
    },
    legalMetaLink: {
      fontSize: 12,
      fontWeight: '500',
      color: theme.colors.textMuted,
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
      paddingTop: 18,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: withOpacity(theme.colors.bg, 0.98),
      shadowColor: '#000',
      shadowOpacity: mode === 'dark' ? 0.24 : 0.08,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: -10 },
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
      height: 60,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.24,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    facilityModalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    facilityModalBlur: {
      ...StyleSheet.absoluteFillObject,
    },
    facilityModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor:
        mode === 'dark' ? withOpacity(theme.colors.bg, 0.56) : withOpacity(theme.colors.text, 0.22),
    },
    facilityScreen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    facilityHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.bg,
    },
    facilityBackButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    facilityHeaderTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    facilityHeaderSpacer: {
      width: 34,
      height: 34,
    },
    facilityContent: {
      paddingHorizontal: 24,
      paddingTop: 28,
      gap: 18,
    },
    facilityIntroBlock: {
      gap: 6,
    },
    facilitySheet: {
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      backgroundColor: theme.colors.bg,
      borderTopWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 34,
      gap: 18,
      shadowColor: '#000',
      shadowOpacity: mode === 'dark' ? 0.34 : 0.18,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: -8 },
      elevation: 18,
    },
    facilitySheetHandle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 999,
      backgroundColor: withOpacity(theme.colors.textMuted, 0.4),
      marginBottom: 6,
    },
    facilitySheetHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
    },
    facilitySheetHeaderText: {
      flex: 1,
      gap: 4,
    },
    facilitySheetEyebrow: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: theme.colors.accent,
    },
    facilitySheetTitle: {
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '700',
      color: theme.colors.text,
    },
    facilitySheetSubtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textMuted,
    },
    facilitySheetClose: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    facilityHeroCard: {
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
      flexDirection: 'row',
      gap: 14,
    },
    facilityHeroIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
    },
    facilityHeroBody: {
      flex: 1,
      gap: 4,
    },
    facilityHeroTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    facilityHeroCopy: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textMuted,
    },
    facilityInputGroup: {
      gap: 8,
    },
    facilityInputLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text,
    },
    facilityInputWrap: {
      minHeight: 58,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
    },
    facilityInput: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
      letterSpacing: 1,
    },
    facilityInputHint: {
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textMuted,
    },
    facilityErrorCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.danger, 0.28),
      backgroundColor: withOpacity(theme.colors.danger, 0.08),
      paddingHorizontal: 12,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    facilityErrorText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.text,
    },
    facilityOfferCard: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.28),
      backgroundColor: withOpacity(theme.colors.accent, 0.08),
      padding: 16,
      gap: 10,
    },
    facilityOfferEyebrow: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: theme.colors.accent,
    },
    facilityOfferTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    facilityOfferRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    facilityOfferText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.text,
    },
    facilityActionRow: {
      gap: 10,
    },
    facilityFooter: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 24,
      paddingTop: 14,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.bg,
    },
    facilityPrimaryButton: {
      height: 58,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    facilitySecondaryButton: {
      minHeight: 50,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    facilitySecondaryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
    primaryButtonPressed: {
      opacity: 0.95,
      transform: [{ scale: 0.985 }],
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    footerSecondaryButton: {
      minHeight: 52,
      marginTop: 10,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      gap: 6,
    },
    footerSecondaryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textMuted,
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
    exitModalBackdropAnimatedLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    exitModalBackdropBlur: {
      ...StyleSheet.absoluteFillObject,
    },
    exitModalBackdropScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor:
        mode === 'dark' ? withOpacity(theme.colors.bg, 0.56) : withOpacity(theme.colors.text, 0.24),
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
      shadowOpacity: mode === 'dark' ? 0.34 : 0.2,
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
