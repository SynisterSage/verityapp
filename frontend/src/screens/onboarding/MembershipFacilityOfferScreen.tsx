import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';

import type { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';
import { logEvent } from '../../services/sentry';
import { resolveFacilityOfferToken, validateFacilityOfferCode } from '../../services/facilityOffers';

const FACILITY_PRODUCT_ID = 'verityprotect_facility_annual';

function normalizeFacilityCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export default function MembershipFacilityOfferScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'MembershipFacilityOffer'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'MembershipFacilityOffer'>>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    products,
    purchase,
    showMembershipActivationNotice,
    isLoadingProducts,
    isProcessingPurchase,
  } = useSubscription();

  const [facilityCode, setFacilityCode] = useState('');
  const [facilityError, setFacilityError] = useState<string | null>(null);
  const [isResolvingClaimToken, setIsResolvingClaimToken] = useState(false);
  const [isFacilityValidating, setIsFacilityValidating] = useState(false);
  const [validatedFacility, setValidatedFacility] = useState<{
    code: string;
    facilityName: string;
    headline: string;
  } | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const hasAttemptedAutoValidateRef = useRef(false);
  const initialFacilityCode = route.params?.initialCode ?? '';
  const claimToken = route.params?.claimToken ?? null;
  const facilitySlug = route.params?.facilitySlug ?? null;
  const launchSource = route.params?.source ?? 'in_app';

  const inputOpacity = useRef(new Animated.Value(1)).current;
  const inputScale = useRef(new Animated.Value(1)).current;
  const revealOpacity = useRef(new Animated.Value(0)).current;
  const revealScale = useRef(new Animated.Value(0.9)).current;
  const successIconScale = useRef(new Animated.Value(0.8)).current;
  const successIconOpacity = useRef(new Animated.Value(0)).current;
  const inputGlowOpacity = useRef(new Animated.Value(0)).current;
  const keyboardLift = useRef(new Animated.Value(0)).current;
  const transitionEasing = useMemo(() => Easing.bezier(0.32, 1, 0.2, 1), []);

  const facilityPlan = products.find((product) => product.productId === FACILITY_PRODUCT_ID);
  const facilityDisplayPrice = facilityPlan?.displayPrice ?? '$74.99';

  useEffect(() => {
    logEvent('membership_facility_offer_opened', {
      screen: 'MembershipFacilityOfferScreen',
      extra: {
        source: launchSource,
        hasClaimToken: Boolean(claimToken),
        hasInitialCode: Boolean(initialFacilityCode),
        facilitySlug: facilitySlug ?? null,
      },
    });
  }, [claimToken, facilitySlug, initialFacilityCode, launchSource]);

  useEffect(() => {
    Animated.timing(inputGlowOpacity, {
      toValue: isInputFocused ? 1 : 0,
      duration: 320,
      easing: transitionEasing,
      useNativeDriver: true,
    }).start();
  }, [inputGlowOpacity, isInputFocused, transitionEasing]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      Animated.timing(keyboardLift, {
        toValue: -108,
        duration: 240,
        easing: transitionEasing,
        useNativeDriver: true,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      Animated.timing(keyboardLift, {
        toValue: 0,
        duration: 220,
        easing: transitionEasing,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardLift, transitionEasing]);

  useEffect(() => {
    if (!validatedFacility) {
      inputOpacity.setValue(1);
      inputScale.setValue(1);
      revealOpacity.setValue(0);
      revealScale.setValue(0.9);
      successIconScale.setValue(0.8);
      successIconOpacity.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.timing(inputOpacity, {
        toValue: 0,
        duration: 480,
        easing: transitionEasing,
        useNativeDriver: true,
      }),
      Animated.timing(inputScale, {
        toValue: 0.95,
        duration: 600,
        easing: transitionEasing,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.parallel([
      Animated.timing(revealOpacity, {
        toValue: 1,
        duration: 800,
        easing: transitionEasing,
        useNativeDriver: true,
      }),
      Animated.timing(revealScale, {
        toValue: 1,
        duration: 800,
        easing: transitionEasing,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.parallel([
      Animated.spring(successIconScale, {
        toValue: 1,
        damping: 12,
        stiffness: 150,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.timing(successIconOpacity, {
        toValue: 1,
        duration: 500,
        easing: transitionEasing,
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    inputOpacity,
    inputScale,
    revealOpacity,
    revealScale,
    successIconOpacity,
    successIconScale,
    transitionEasing,
    validatedFacility,
  ]);

  const handleFacilityCodeChange = (text: string) => {
    setFacilityCode(normalizeFacilityCode(text));
    if (facilityError) {
      setFacilityError(null);
    }
  };

  const handleFacilityValidate = useCallback(async (rawCode?: string) => {
    const normalizedCode = normalizeFacilityCode(rawCode ?? facilityCode);
    if (normalizedCode.length < 6) {
      setFacilityError('Enter the code from your brochure or community QR page.');
      return;
    }

    setFacilityError(null);
    setIsFacilityValidating(true);
    setFacilityCode(normalizedCode);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);

    try {
      const response = await validateFacilityOfferCode(normalizedCode);
      setValidatedFacility({
        code: response.code,
        facilityName: response.facility.name,
        headline: 'Access Granted',
      });
      setIsFacilityValidating(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      logEvent('membership_facility_code_validated', {
        screen: 'MembershipFacilityOfferScreen',
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
  }, [facilityCode]);

  useEffect(() => {
    const normalizedInitialCode = normalizeFacilityCode(initialFacilityCode);
    if (hasAttemptedAutoValidateRef.current) {
      return;
    }

    if (claimToken?.trim()) {
      hasAttemptedAutoValidateRef.current = true;
      setIsResolvingClaimToken(true);
      setFacilityError(null);
      void resolveFacilityOfferToken(claimToken.trim())
        .then((response) => {
          const resolvedCode = normalizeFacilityCode(response.code);
          if (!resolvedCode) {
            throw new Error('Facility link is missing a valid code.');
          }
          setFacilityCode(resolvedCode);
          return handleFacilityValidate(resolvedCode);
        })
        .catch((error) => {
          setFacilityError(
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : 'This facility link is invalid or expired. Enter your code manually.'
          );
        })
        .finally(() => {
          setIsResolvingClaimToken(false);
        });
      return;
    }

    if (!normalizedInitialCode) {
      return;
    }

    hasAttemptedAutoValidateRef.current = true;
    setFacilityCode(normalizedInitialCode);
    void handleFacilityValidate(normalizedInitialCode);
  }, [claimToken, handleFacilityValidate, initialFacilityCode]);

  const handleFacilityPurchase = async () => {
    if (!validatedFacility) {
      return;
    }

    setFacilityError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
    logEvent('membership_facility_claim_pressed', {
      screen: 'MembershipFacilityOfferScreen',
      extra: { facilityName: validatedFacility.facilityName, code: validatedFacility.code },
    });

    const result = await purchase(FACILITY_PRODUCT_ID, {
      facilityCode: validatedFacility.code,
    });

    if (result.status === 'purchased') {
      showMembershipActivationNotice({
        productId: FACILITY_PRODUCT_ID,
        planLabel: 'Verity Protect Facility',
      });
      navigation.replace('MembershipActivated');
      logEvent('membership_purchase_success', {
        screen: 'MembershipFacilityOfferScreen',
        extra: { productId: FACILITY_PRODUCT_ID, facilityName: validatedFacility.facilityName },
      });
      logEvent('membership_trial_started', {
        screen: 'MembershipFacilityOfferScreen',
        extra: { productId: FACILITY_PRODUCT_ID },
      });
      return;
    }

    const nextMessage =
      result.message?.trim().length
        ? result.message
        : result.status === 'cancelled'
          ? 'Purchase cancelled.'
          : result.status === 'pending'
            ? 'Purchase is pending approval.'
            : 'Could not complete the facility purchase. Please try again.';
    setFacilityError(nextMessage);
    void Haptics.notificationAsync(
      result.status === 'failed'
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Warning
    ).catch(() => null);
  };

  const handleClose = useCallback(() => {
    void Haptics.selectionAsync().catch(() => null);
    const routeNames = navigation.getState?.().routeNames ?? [];

    // QR/deeplink flow should always land on paywall, not previous auth/root screen.
    if (launchSource === 'deeplink') {
      if (routeNames.includes('Membership')) {
        navigation.replace('Membership');
        return;
      }
      if (routeNames.includes('AppTabs')) {
        navigation.replace('AppTabs');
        return;
      }
    }

    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    if (routeNames.includes('Membership')) {
      navigation.navigate('Membership');
      return;
    }

    if (routeNames.includes('AppTabs')) {
      navigation.navigate('AppTabs');
    }
  }, [launchSource, navigation]);

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 16) }]}>
        <Pressable style={styles.backButton} onPress={handleClose}>
          <Ionicons name="chevron-down" size={18} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Facility Partner</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Animated.View
        style={[
          styles.keyboardAvoidingView,
          {
            marginTop: Math.max(insets.top, 16),
            transform: [{ translateY: keyboardLift }],
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 28) + (isKeyboardVisible ? 28 : 176) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {!validatedFacility ? (
          <Animated.View
            style={[
              styles.stateBlock,
              {
                opacity: inputOpacity,
                transform: [{ scale: inputScale }],
              },
            ]}
          >
            <View style={styles.heroWrap}>
              <Text style={styles.heroTitle}>
                Unlock your{'\n'}
                <Text style={styles.heroTitleAccent}>Community Benefit.</Text>
              </Text>
              <Text style={styles.heroCopy}>
                Enter your unique facility code to access exclusive protection rates reserved for your residents.
              </Text>
            </View>

            <View style={styles.entrySection}>
              <View style={styles.accessRow}>
                <Text style={styles.inputLabel}>Access Key</Text>
                <Ionicons name="key-outline" size={14} color={theme.colors.textMuted} />
              </View>

              <View style={styles.inputFrame}>
                <Animated.View
                  style={[
                    styles.inputFieldShell,
                    isInputFocused && styles.inputFieldShellFocused,
                    {
                      opacity: inputGlowOpacity.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1],
                      }),
                    },
                  ]}
                >
                  <TextInput
                    style={styles.input}
                    placeholder="Enter facility code"
                    placeholderTextColor={withOpacity(theme.colors.textMuted, 0.38)}
                    value={facilityCode}
                    onChangeText={handleFacilityCodeChange}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!isFacilityValidating && !isResolvingClaimToken && !isProcessingPurchase}
                    returnKeyType="done"
                    textAlign="center"
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                  />
                </Animated.View>
                <View style={[styles.inputUnderline, isInputFocused && styles.inputUnderlineFocused]} />
              </View>

              <Text style={styles.inputHint}>Check your welcome brochure or community board.</Text>
            </View>

            {facilityError ? (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.colors.danger} />
                <Text style={styles.errorText}>{facilityError}</Text>
              </View>
            ) : null}
          </Animated.View>
        ) : (
          <Animated.View
            style={[
              styles.stateBlock,
              styles.revealState,
              {
                opacity: revealOpacity,
                transform: [{ scale: revealScale }],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.successIconShell,
                {
                  opacity: successIconOpacity,
                  transform: [{ scale: successIconScale }],
                },
              ]}
            >
              <View style={styles.successIconInner}>
                <Ionicons name="shield-checkmark-outline" size={28} color="#FFFFFF" />
              </View>
            </Animated.View>

            <View style={styles.revealHero}>
              <Text style={styles.revealTitle}>Access Granted</Text>
              <Text style={styles.revealCopy}>Welcome, resident of {validatedFacility.facilityName}.</Text>
            </View>

            <View style={styles.offerCard}>
              <View style={styles.offerHeader}>
                <View style={styles.offerHeaderText}>
                  <Text style={styles.offerEyebrow}>Partner Offer</Text>
                  <Text style={styles.offerTitle}>{validatedFacility.facilityName}</Text>
                </View>
              </View>

              <View style={styles.offerList}>
                <View style={styles.offerRow}>
                  <View style={styles.offerDot} />
                  <View style={styles.offerCopyWrap}>
                    <Text style={styles.offerRowTitle}>14-Day Extended Trial</Text>
                    <Text style={styles.offerRowCopy}>Double the standard protection period.</Text>
                  </View>
                </View>
                <View style={styles.offerRow}>
                  <View style={styles.offerDot} />
                  <View style={styles.offerCopyWrap}>
                    <Text style={styles.offerRowTitle}>{facilityDisplayPrice} Annual Rate</Text>
                    <Text style={styles.offerRowCopy}>Exclusive community-only pricing.</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.codeAppliedPill}>
              <Ionicons name="sparkles-outline" size={14} color={theme.colors.textMuted} />
              <Text style={styles.codeAppliedText}>Invite code automatically applied</Text>
            </View>

            {facilityError ? (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.colors.danger} />
                <Text style={styles.errorText}>{facilityError}</Text>
              </View>
            ) : null}
          </Animated.View>
        )}
        </ScrollView>

        {!isKeyboardVisible ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        {!validatedFacility ? (
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              isFacilityValidating && styles.buttonDisabled,
            ]}
            onPress={() => {
              void handleFacilityValidate();
            }}
            disabled={isFacilityValidating || isResolvingClaimToken}
          >
            {isFacilityValidating || isResolvingClaimToken ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Verify Access</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              (isProcessingPurchase || isLoadingProducts) && styles.buttonDisabled,
            ]}
            onPress={handleFacilityPurchase}
            disabled={isProcessingPurchase || isLoadingProducts}
          >
            {isProcessingPurchase ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Claim My Benefit</Text>
            )}
          </Pressable>
        )}

        <Pressable
          style={styles.secondaryLinkWrap}
          onPress={validatedFacility ? () => setValidatedFacility(null) : handleClose}
          disabled={isFacilityValidating || isProcessingPurchase}
        >
          <Text style={styles.secondaryLinkText}>
            {validatedFacility ? 'Use different code' : 'Close'}
          </Text>
        </Pressable>
          </View>
        ) : null}
      </Animated.View>
    </SafeAreaView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    headerRow: {
      minHeight: 80,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      position: 'relative',
      zIndex: 20,
      elevation: 20,
      backgroundColor: theme.colors.bg,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    headerPill: {
      width: 12,
      height: 4,
      borderRadius: 999,
      backgroundColor: withOpacity(theme.colors.textMuted, 0.38),
    },
    headerTitle: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.75,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
    },
    headerSpacer: {
      width: 36,
      height: 36,
    },
    keyboardAvoidingView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 12,
    },
    stateBlock: {
      minHeight: 520,
    },
    revealState: {
      alignItems: 'center',
    },
    heroWrap: {
      alignItems: 'center',
      gap: 14,
      marginTop: 8,
      marginBottom: 44,
    },
    heroTitle: {
      fontSize: 42,
      lineHeight: 46,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
    },
    heroTitleAccent: {
      color: theme.colors.accent,
    },
    heroCopy: {
      maxWidth: 310,
      fontSize: 16,
      lineHeight: 24,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    entrySection: {
      gap: 18,
    },
    accessRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.65,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
    },
    inputFrame: {
      position: 'relative',
      minHeight: 96,
      justifyContent: 'flex-end',
    },
    inputFieldShell: {
      minHeight: 68,
      justifyContent: 'center',
      borderRadius: 24,
      backgroundColor: withOpacity(theme.colors.accent, 0.04),
      paddingHorizontal: 12,
    },
    inputFieldShellFocused: {
      backgroundColor: withOpacity(theme.colors.accent, 0.08),
    },
    input: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '600',
      color: theme.colors.text,
      paddingHorizontal: 8,
      paddingTop: 10,
      paddingBottom: 8,
      letterSpacing: 1.2,
    },
    inputUnderline: {
      height: 1,
      backgroundColor: withOpacity(theme.colors.text, 0.18),
      marginTop: 12,
    },
    inputUnderlineFocused: {
      backgroundColor: withOpacity(theme.colors.accent, 0.9),
    },
    inputHint: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    errorCard: {
      marginTop: 20,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.danger, 0.24),
      backgroundColor: withOpacity(theme.colors.danger, 0.08),
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    errorText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.text,
    },
    successIconShell: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.success, 0.18),
      marginTop: 6,
      marginBottom: 20,
    },
    successIconInner: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.success,
    },
    revealHero: {
      alignItems: 'center',
      gap: 10,
      marginBottom: 24,
    },
    revealTitle: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
    },
    revealCopy: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    offerCard: {
      alignSelf: 'stretch',
      borderRadius: 32,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 20,
      gap: 18,
    },
    offerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    offerHeaderText: {
      flex: 1,
      gap: 4,
    },
    offerEyebrow: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: theme.colors.accent,
    },
    offerTitle: {
      fontSize: 20,
      lineHeight: 24,
      fontWeight: '600',
      color: theme.colors.text,
    },
    offerList: {
      gap: 16,
    },
    offerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    offerDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 7,
      backgroundColor: theme.colors.accent,
    },
    offerCopyWrap: {
      flex: 1,
      gap: 4,
    },
    offerRowTitle: {
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '600',
      color: theme.colors.text,
    },
    offerRowCopy: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textMuted,
    },
    codeAppliedPill: {
      alignSelf: 'stretch',
      minHeight: 54,
      marginTop: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.colors.border,
      backgroundColor: withOpacity(theme.colors.surface, 0.64),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    codeAppliedText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.colors.textMuted,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 24,
      paddingTop: 14,
      backgroundColor: theme.colors.bg,
    },
    primaryButton: {
      height: 72,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
      backgroundColor: theme.colors.accent,
    },
    primaryButtonPressed: {
      opacity: 0.95,
      transform: [{ scale: 0.985 }],
    },
    primaryButtonText: {
      fontSize: 18,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    buttonDisabled: {
      opacity: 0.65,
    },
    secondaryLinkWrap: {
      minHeight: 34,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },
    secondaryLinkText: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
    },
  });
}
