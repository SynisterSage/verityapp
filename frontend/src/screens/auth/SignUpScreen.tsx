import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Modal,
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
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { logEvent } from '../../services/sentry';
import { FALLBACK_LEGAL_VERSIONS, fetchCurrentLegalVersions } from '../../services/legal';
import { withOpacity } from '../../utils/color';
import type { RootStackParamList } from '../../navigation/types';

type AlertState = {
  message: string;
  type: 'warning' | 'danger';
};

type EmailAvailabilityState =
  | 'idle'
  | 'invalid'
  | 'checking'
  | 'available'
  | 'taken'
  | 'error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatFacilityNameFromSlug(slug?: string) {
  const value = slug?.trim();
  if (!value) {
    return null;
  }
  return value
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export default function SignUpScreen({
  navigation,
  route,
}: {
  navigation: any;
  route?: { params?: RootStackParamList['SignUp'] };
}) {
  const { signUp, signInWithGoogle, signInWithApple } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [focusField, setFocusField] = useState<'email' | 'password' | 'confirm' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSocialHandoffLoading, setIsSocialHandoffLoading] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [legalModalVisible, setLegalModalVisible] = useState(false);
  const [legalScrolledToEnd, setLegalScrolledToEnd] = useState(false);
  const [isLegalModalClosing, setIsLegalModalClosing] = useState(false);
  const [isLegalAcceptanceAnimating, setIsLegalAcceptanceAnimating] = useState(false);
  const [legalVersions, setLegalVersions] = useState(FALLBACK_LEGAL_VERSIONS);
  const [emailAvailability, setEmailAvailability] =
    useState<EmailAvailabilityState>('idle');
  const isFacilityClaimPromptVisible = Boolean(route?.params?.facilityClaimPrompt);
  const facilityNameFromPrompt = formatFacilityNameFromSlug(route?.params?.facilitySlug);
  const isInviteClaimPromptVisible = Boolean(route?.params?.inviteClaimPrompt);
  const legalBackdropOpacity = useMemo(() => new Animated.Value(0), []);
  const legalCardOpacity = useMemo(() => new Animated.Value(0), []);
  const legalCardTranslateY = useMemo(() => new Animated.Value(14), []);
  const legalAcceptCheckScale = useMemo(() => new Animated.Value(0.86), []);

  useEffect(() => {
    let active = true;
    fetchCurrentLegalVersions().then((versions) => {
      if (active) {
        setLegalVersions(versions);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setEmailAvailability('idle');
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setEmailAvailability('invalid');
      return;
    }

    const baseUrl =
      process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
    if (!baseUrl) {
      setEmailAvailability('idle');
      return;
    }

    const controller = new AbortController();
    setEmailAvailability('checking');
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `${baseUrl}/auth/check-email?email=${encodeURIComponent(normalizedEmail)}`,
          {
            signal: controller.signal,
          }
        );
        if (!response.ok) {
          throw new Error(`check-email failed (${response.status})`);
        }
        const body = (await response.json()) as { exists?: boolean };
        setEmailAvailability(body?.exists ? 'taken' : 'available');
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setEmailAvailability('error');
      }
    }, 450);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [email]);

  const inputBorderColor = (field: 'email' | 'password' | 'confirm') =>
    focusField === field ? theme.colors.accent : theme.colors.border;
  const isLengthValid = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password);
  const passwordCriteria = useMemo(
    () => [
      { label: 'At least 8 characters', met: isLengthValid },
      { label: 'Includes a letter', met: hasLetter },
      { label: 'Includes a special character', met: hasSpecialChar },
    ],
    [hasLetter, hasSpecialChar, isLengthValid]
  );

  const handleSubmit = async () => {
    setAlert(null);
    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setAlert({ message: 'Enter a valid email address.', type: 'warning' });
      return;
    }

    if (emailAvailability === 'taken') {
      setAlert({
        message: 'This email is already in use. Please sign in instead.',
        type: 'warning',
      });
      return;
    }

    if (!acceptedLegal) {
      setAlert({
        message: 'Please agree to the terms of service and privacy policy before creating an account.',
        type: 'warning',
      });
      logEvent('signup_validation_failed', {
        level: 'warning',
        screen: 'SignUp',
        extra: { reason: 'legal_not_accepted' },
      });
      return;
    }

    if (password !== confirmPassword) {
      setAlert({ message: 'Passwords must match.', type: 'warning' });
      logEvent('signup_validation_failed', {
        level: 'warning',
        screen: 'SignUp',
        extra: { reason: 'password_mismatch' },
      });
      return;
    }

    const hasLetter = /[A-Za-z]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (password.length < 8 || !hasLetter || !hasSpecial) {
      setAlert({
        message:
          'Password must be at least 8 characters and include a letter and a special character.',
        type: 'warning',
      });
      logEvent('signup_validation_failed', {
        level: 'warning',
        screen: 'SignUp',
        extra: { reason: 'password_policy' },
      });
      return;
    }

    setIsSubmitting(true);
    logEvent('signup_attempt', { screen: 'SignUp' });
    const result = await signUp(normalizedEmail, password, {
      termsVersion: legalVersions.termsVersion,
      privacyVersion: legalVersions.privacyVersion,
      acceptedAt: new Date().toISOString(),
      source: 'mobile_signup',
    });
    setIsSubmitting(false);

    if (result.error) {
      setAlert({ message: result.error, type: 'danger' });
      logEvent('signup_failed', {
        level: 'warning',
        screen: 'SignUp',
        extra: { reason: result.error },
      });
      return;
    }
    if (result.needsConfirmation) {
      logEvent('signup_needs_confirmation', { screen: 'SignUp' });
      navigation.navigate('ConfirmEmail', { email: normalizedEmail });
      return;
    }
    logEvent('signup_success', { screen: 'SignUp' });
  };

  const handleGoogleSignUp = async () => {
    setAlert(null);
    setIsSocialHandoffLoading(true);
    logEvent('signup_google_attempt', { screen: 'SignUp' });
    try {
      const message = await signInWithGoogle();
      if (message) {
        setIsSocialHandoffLoading(false);
        setAlert({ message, type: 'danger' });
        logEvent('signup_google_failed', {
          level: 'warning',
          screen: 'SignUp',
          extra: { reason: message },
        });
      }
    } catch (error: any) {
      setIsSocialHandoffLoading(false);
      const message = error?.message || 'Google sign in failed.';
      setAlert({ message, type: 'danger' });
      logEvent('signup_google_failed', {
        level: 'warning',
        screen: 'SignUp',
        extra: { reason: message },
      });
    }
  };

  const handleAppleSignUp = async () => {
    setAlert(null);
    setIsSocialHandoffLoading(true);
    logEvent('signup_apple_attempt', { screen: 'SignUp' });
    try {
      const message = await signInWithApple();
      if (message) {
        setIsSocialHandoffLoading(false);
        setAlert({ message, type: 'danger' });
        logEvent('signup_apple_failed', {
          level: 'warning',
          screen: 'SignUp',
          extra: { reason: message },
        });
      }
    } catch (error: any) {
      setIsSocialHandoffLoading(false);
      const message = error?.message || 'Apple sign in failed.';
      setAlert({ message, type: 'danger' });
      logEvent('signup_apple_failed', {
        level: 'warning',
        screen: 'SignUp',
        extra: { reason: message },
      });
    }
  };

  const renderEye = (visible: boolean) => (
    <Svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      style={styles.eyeIcon}
      fill="none"
      stroke={visible ? theme.colors.accent : theme.colors.textMuted}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      {visible ? null : <Path d="M4 4l16 16" />}
    </Svg>
  );

  const alertColor = alert?.type === 'warning' ? theme.colors.warning : theme.colors.danger;
  const alertBg =
    alert?.type === 'warning'
      ? withOpacity(theme.colors.warning, 0.08)
      : withOpacity(theme.colors.danger, 0.08);

  const alertSpacing = alert ? 40 : 24;
  const scrollPaddingBottom = Math.max(insets.bottom, 32) + 80 + alertSpacing;
  const bottomBuffer = scrollPaddingBottom + 64;
  const requiresLegalAcceptance = !acceptedLegal;
  const canConfirmLegal =
    !requiresLegalAcceptance || (legalScrolledToEnd && !isLegalModalClosing && !isLegalAcceptanceAnimating);

  const animateLegalModalIn = () => {
    legalBackdropOpacity.setValue(0);
    legalCardOpacity.setValue(0);
    legalCardTranslateY.setValue(14);
    Animated.parallel([
      Animated.timing(legalBackdropOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(legalCardOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(legalCardTranslateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeLegalModal = (onClosed?: () => void) => {
    if (isLegalModalClosing || isLegalAcceptanceAnimating) {
      return;
    }
    setIsLegalModalClosing(true);
    Animated.parallel([
      Animated.timing(legalBackdropOpacity, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(legalCardOpacity, {
        toValue: 0,
        duration: 170,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(legalCardTranslateY, {
        toValue: 10,
        duration: 170,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      setIsLegalModalClosing(false);
      if (finished) {
        setLegalModalVisible(false);
        onClosed?.();
      }
    });
  };

  const openLegalModal = () => {
    if (legalModalVisible) {
      return;
    }
    setLegalScrolledToEnd(false);
    setIsLegalModalClosing(false);
    setIsLegalAcceptanceAnimating(false);
    setLegalModalVisible(true);
  };

  useEffect(() => {
    if (!legalModalVisible) {
      return;
    }
    animateLegalModalIn();
  }, [legalModalVisible, legalBackdropOpacity, legalCardOpacity, legalCardTranslateY]);

  const confirmLegalAcceptance = () => {
    if (!canConfirmLegal || isLegalAcceptanceAnimating || isLegalModalClosing) {
      return;
    }

    if (!requiresLegalAcceptance) {
      closeLegalModal();
      return;
    }

    setIsLegalAcceptanceAnimating(true);
    legalAcceptCheckScale.setValue(0.86);
    Animated.sequence([
      Animated.spring(legalAcceptCheckScale, {
        toValue: 1.16,
        speed: 20,
        bounciness: 10,
        useNativeDriver: true,
      }),
      Animated.spring(legalAcceptCheckScale, {
        toValue: 1,
        speed: 24,
        bounciness: 6,
        useNativeDriver: true,
      }),
      Animated.delay(70),
    ]).start(() => {
      setAcceptedLegal(true);
      setIsLegalAcceptanceAnimating(false);
      closeLegalModal();
    });
  };

  const emailStatusMessage =
    emailAvailability === 'taken'
      ? 'This email is already in use. Try signing in.'
      : emailAvailability === 'checking'
      ? 'Checking email...'
      : emailAvailability === 'error'
      ? 'Could not verify this email right now.'
      : null;
  const emailStatusColor =
    emailAvailability === 'taken'
      ? theme.colors.danger
      : emailAvailability === 'error'
      ? theme.colors.warning
      : theme.colors.textDim;

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.bg,
          paddingTop: 24 + insets.top,
          paddingBottom: 24 + insets.bottom,
        },
      ]}
      edges={['bottom']}
    >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomBuffer },
          ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.fontFamily }]}>
            Start Today
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: theme.colors.textMuted, fontFamily: theme.typography.fontFamily },
            ]}
          >
            Create your Verity account.
          </Text>
        </View>

        {isFacilityClaimPromptVisible ? (
          <View
            style={[
              styles.facilityClaimPrompt,
              {
                borderColor: withOpacity(theme.colors.accent, 0.42),
                backgroundColor: withOpacity(theme.colors.accent, 0.1),
              },
            ]}
          >
            <View style={[styles.facilityClaimIcon, { backgroundColor: withOpacity(theme.colors.accent, 0.2) }]}>
              <Ionicons name="business-outline" size={14} color={theme.colors.accent} />
            </View>
            <View style={styles.facilityClaimTextWrap}>
              <Text style={[styles.facilityClaimTitle, { color: theme.colors.text }]}>
                Sign up required to claim facility partnership
              </Text>
              <Text style={[styles.facilityClaimBody, { color: theme.colors.textMuted }]}>
                {facilityNameFromPrompt
                  ? `Create your account to claim ${facilityNameFromPrompt}'s partner offer.`
                  : 'Create your account to claim your facility partner offer.'}
              </Text>
            </View>
          </View>
        ) : null}

        {isInviteClaimPromptVisible ? (
          <View
            style={[
              styles.facilityClaimPrompt,
              {
                borderColor: withOpacity(theme.colors.accent, 0.42),
                backgroundColor: withOpacity(theme.colors.accent, 0.1),
              },
            ]}
          >
            <View style={[styles.facilityClaimIcon, { backgroundColor: withOpacity(theme.colors.accent, 0.2) }]}>
              <Ionicons name="people-outline" size={14} color={theme.colors.accent} />
            </View>
            <View style={styles.facilityClaimTextWrap}>
              <Text style={[styles.facilityClaimTitle, { color: theme.colors.text }]}>
                Sign up required to join this circle
              </Text>
              <Text style={[styles.facilityClaimBody, { color: theme.colors.textMuted }]}>
                Create your account and we'll prefill your invite code automatically.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.fields}>
          <View style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: theme.colors.textDim }]}>Email</Text>
            <TextInput
              placeholder="name@email.com"
              placeholderTextColor={theme.colors.textDim}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[
                styles.input,
                {
                  borderColor: inputBorderColor('email'),
                  backgroundColor: theme.colors.surfaceAlt,
                  color: theme.colors.text,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocusField('email')}
              onBlur={() => setFocusField((prev) => (prev === 'email' ? null : prev))}
            />
            {emailStatusMessage ? (
              <Text style={[styles.emailStatusText, { color: emailStatusColor }]}>
                {emailStatusMessage}
              </Text>
            ) : null}
          </View>

        <View style={styles.fieldWrapper}>
          <Text style={[styles.fieldLabel, { color: theme.colors.textDim }]}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
                placeholder="••••••••"
                placeholderTextColor={theme.colors.textDim}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                autoComplete="new-password"
                passwordRules={
                  Platform.OS === 'ios'
                    ? 'minlength: 8; required: lower; required: upper; required: digit; required: special;'
                    : undefined
                }
                style={[
                  styles.input,
                  {
                    borderColor: inputBorderColor('password'),
                    backgroundColor: theme.colors.surfaceAlt,
                    color: theme.colors.text,
                    paddingRight: 60,
                  },
                ]}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusField('password')}
                onBlur={() => setFocusField((prev) => (prev === 'password' ? null : prev))}
            />
            <Pressable
              style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true }}
              >
                {renderEye(showPassword)}
              </Pressable>
          </View>
        </View>

          <View style={styles.fieldWrapper}>
          <Text style={[styles.fieldLabel, { color: theme.colors.textDim }]}>Confirm password</Text>
          <View style={styles.passwordRow}>
            <TextInput
                placeholder="••••••••"
                placeholderTextColor={theme.colors.textDim}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={Platform.OS === 'ios' ? 'password' : 'none'}
                autoComplete={Platform.OS === 'ios' ? 'password' : 'off'}
                style={[
                  styles.input,
                  {
                    borderColor: inputBorderColor('confirm'),
                    backgroundColor: theme.colors.surfaceAlt,
                    color: theme.colors.text,
                    paddingRight: 60,
                  },
                ]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => setFocusField('confirm')}
                onBlur={() => setFocusField((prev) => (prev === 'confirm' ? null : prev))}
            />
            <Pressable
              style={styles.eyeButton}
              onPress={() => setShowConfirm((prev) => !prev)}
              android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true }}
            >
              {renderEye(showConfirm)}
            </Pressable>
          </View>
        <View style={styles.criteriaList}>
          {passwordCriteria.map((item) => (
            <View key={item.label} style={styles.criteriaRow}>
              <Ionicons
                name={item.met ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={item.met ? theme.colors.success : theme.colors.textDim}
                style={styles.criteriaIcon}
              />
              <Text
                style={[
                  styles.criteriaText,
                  { color: item.met ? theme.colors.text : theme.colors.textDim },
                ]}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.checkboxRow}>
          <Pressable
            style={styles.checkbox}
            onPress={openLegalModal}
          >
            <Ionicons
              name={acceptedLegal ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={acceptedLegal ? theme.colors.accent : theme.colors.textDim}
            />
            <View style={styles.checkboxCopy}>
              <View style={styles.checkboxInlineRow}>
                <Text
                  numberOfLines={1}
                  style={[styles.checkboxInlineLabel, { color: theme.colors.text }]}
                >
                  {acceptedLegal ? 'Terms & Privacy accepted' : 'Terms & Privacy required'}
                </Text>
                <View
                  style={[
                    styles.checkboxInlineCta,
                    { backgroundColor: withOpacity(theme.colors.accent, 0.14) },
                  ]}
                >
                  <Text style={[styles.checkboxInlineCtaLabel, { color: theme.colors.accent }]}>
                    {acceptedLegal ? 'Review' : 'Review & Accept'}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        </View>
        </View>

          {alert ? (
            <View
              style={[
                styles.loginError,
                {
                  borderColor: alertColor,
                  backgroundColor: alertBg,
                  marginTop: 14,
                },
              ]}
            >
              <Text style={[styles.loginErrorText, { color: alertColor }]}>
                {alert.message}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={legalModalVisible}
        transparent
        animationType="none"
        onRequestClose={() => closeLegalModal()}
      >
        <View style={styles.legalModalOverlay}>
          <Animated.View
            style={[
              styles.legalModalBackdrop,
              { opacity: legalBackdropOpacity },
            ]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => closeLegalModal()}
              disabled={isLegalModalClosing || isLegalAcceptanceAnimating}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.legalModalCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              {
                opacity: legalCardOpacity,
                transform: [{ translateY: legalCardTranslateY }],
              },
            ]}
          >
            <Text style={[styles.legalModalTitle, { color: theme.colors.text }]}>
              Terms & Privacy
            </Text>
            <Text style={[styles.legalModalSubtitle, { color: theme.colors.textMuted }]}>
              Scroll through this summary, then accept to continue.
            </Text>
            <ScrollView
              style={[
                styles.legalScroll,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
              ]}
              contentContainerStyle={styles.legalScrollContent}
              showsVerticalScrollIndicator
              onContentSizeChange={(_, contentHeight) => {
                if (contentHeight <= 250) {
                  setLegalScrolledToEnd(true);
                }
              }}
              onScroll={({ nativeEvent }) => {
                const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                const nearBottom =
                  layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
                if (nearBottom && !legalScrolledToEnd) {
                  setLegalScrolledToEnd(true);
                }
              }}
              scrollEventThrottle={16}
            >
              <Text style={[styles.legalParagraph, { color: theme.colors.text }]}>
                By creating an account, you agree to the Verity Protect Terms of Service and Privacy
                Policy. These documents explain arbitration, acceptable use, billing, data handling,
                retention, and your privacy rights.
              </Text>
              <Text style={[styles.legalParagraph, { color: theme.colors.text }]}>
                Key points: your circle data is protected with role-based access, call records are
                available while your profile is active unless you clear them, and deletion removes
                active profile data from production systems.
              </Text>
              <Text style={[styles.legalParagraph, { color: theme.colors.text }]}>
                You can open the full legal documents below before accepting.
              </Text>
              <View style={styles.legalLinksGroup}>
                <Pressable onPress={() => Linking.openURL(legalVersions.termsUrl)}>
                  <Text style={[styles.linkText, styles.legalLinkText, { color: theme.colors.accent }]}>
                    Open Terms of Service
                  </Text>
                </Pressable>
                <Pressable onPress={() => Linking.openURL(legalVersions.privacyUrl)}>
                  <Text style={[styles.linkText, styles.legalLinkText, { color: theme.colors.accent }]}>
                    Open Privacy Policy
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
            <View style={styles.legalModalActions}>
              <Pressable
                style={[styles.legalActionButton, { borderColor: theme.colors.border }]}
                onPress={() => closeLegalModal()}
                disabled={isLegalModalClosing || isLegalAcceptanceAnimating}
              >
                <Text style={[styles.legalActionLabel, { color: theme.colors.textMuted }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.legalActionButton,
                  styles.legalActionPrimary,
                  {
                    backgroundColor: canConfirmLegal
                      ? theme.colors.accent
                      : withOpacity(theme.colors.textMuted, 0.4),
                  },
                ]}
                disabled={!canConfirmLegal}
                onPress={confirmLegalAcceptance}
              >
                <View style={styles.legalActionPrimaryInner}>
                  {isLegalAcceptanceAnimating ? (
                    <Animated.View style={{ transform: [{ scale: legalAcceptCheckScale }] }}>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    </Animated.View>
                  ) : null}
                  <Text style={styles.legalActionPrimaryLabel}>
                    {isLegalAcceptanceAnimating
                      ? 'Saved'
                      : requiresLegalAcceptance
                        ? 'Accept'
                        : 'Done'}
                  </Text>
                </View>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <ActionFooter
        primaryLabel={isSubmitting ? 'Creating…' : 'Create Account'}
        onPrimaryPress={handleSubmit}
        primaryLoading={isSubmitting}
        primaryDisabled={!acceptedLegal || emailAvailability === 'taken' || isSocialHandoffLoading}
        secondaryLabel="Apple"
        onSecondaryPress={handleAppleSignUp}
        secondaryIcon={
          <View
            style={[
              styles.appleIcon,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            ]}
          >
            <Ionicons name="logo-apple" size={16} color={theme.colors.text} />
          </View>
        }
        tertiaryLabel="Google"
        onTertiaryPress={handleGoogleSignUp}
        tertiaryIcon={
          <View style={[styles.googleIcon, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.googleIconText, { color: theme.colors.accent }]}>G</Text>
          </View>
        }
        helperPrefix="Already have an account?"
        helperActionLabel="Sign In"
        onHelperPress={() =>
          navigation.navigate(
            'SignIn',
            isFacilityClaimPromptVisible || isInviteClaimPromptVisible
              ? {
                  facilityClaimPrompt: isFacilityClaimPromptVisible,
                  facilitySlug: route?.params?.facilitySlug,
                  inviteClaimPrompt: isInviteClaimPromptVisible,
                }
              : undefined
          )
        }
        subHelperPrimaryLabel="How it works"
        onSubHelperPrimaryPress={() => {
          logEvent('signup_how_it_works_opened', { screen: 'SignUp' });
          navigation.navigate('MembershipExperience', { source: 'auth', origin: 'signup' });
        }}
        subHelperSecondaryLabel="Why choose Verity"
        onSubHelperSecondaryPress={() => {
          logEvent('signup_why_choose_opened', { screen: 'SignUp' });
          navigation.navigate('WhyChooseVerity');
        }}
        legalPrivacyLabel="Privacy Policy"
        onLegalPrivacyPress={() => {
          void Linking.openURL(legalVersions.privacyUrl).catch(() => null);
        }}
        legalTermsLabel="Terms of Use"
        onLegalTermsPress={() => {
          void Linking.openURL(legalVersions.termsUrl).catch(() => null);
        }}
      />
      {isSocialHandoffLoading ? (
        <View style={[styles.handoffOverlay, { backgroundColor: withOpacity(theme.colors.bg, 0.96) }]}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={[styles.handoffTitle, { color: theme.colors.text }]}>Finishing sign in…</Text>
          <Text style={[styles.handoffSubtitle, { color: theme.colors.textMuted }]}>
            Taking you to onboarding now.
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 0,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    minHeight: '100%',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  fields: {
    marginTop: 32,
    marginBottom: 36,
  },
  facilityClaimPrompt: {
    marginTop: 14,
    marginBottom: 2,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  facilityClaimIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  facilityClaimTextWrap: {
    flex: 1,
    gap: 2,
  },
  facilityClaimTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  facilityClaimBody: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  fieldWrapper: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  criteriaList: {
    marginTop: 12,
    paddingLeft: 4,
    gap: 4,
  },
  criteriaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  criteriaIcon: {
    marginTop: 2,
  },
  criteriaText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  emailStatusText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
    paddingLeft: 4,
  },
  input: {
    height: 60,
    borderWidth: 1,
    borderRadius: 24,
    overflow: 'hidden',
    paddingHorizontal: 20,
    fontSize: 16,
  },
  passwordRow: {
    position: 'relative',
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    top: 14,
    height: 32,
    width: 64,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  eyeIcon: {
    marginRight: 4,
  },
  loginError: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 0,
    marginTop: 8,
    backgroundColor: 'rgba(225, 29, 72, 0.08)',
  },
  loginErrorText: {
    fontSize: 14,
  },
  googleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d6df6',
  },
  appleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxRow: {
    marginTop: 4,
    marginBottom: -10,
    left: 2,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkboxCopy: {
    flex: 1,
  },
  checkboxInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  checkboxInlineLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 18,
  },
  checkboxInlineCta: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxInlineCtaLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  legalModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  legalModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  legalModalCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  legalModalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  legalModalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  legalScroll: {
    maxHeight: 260,
    borderWidth: 1,
    borderRadius: 14,
  },
  legalScrollContent: {
    padding: 12,
  },
  legalParagraph: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  legalLinksGroup: {
    gap: 6,
    paddingTop: 2,
    paddingBottom: 8,
  },
  legalLinkText: {
    lineHeight: 20,
  },
  legalModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  legalActionButton: {
    minWidth: 92,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  legalActionPrimary: {
    borderWidth: 0,
  },
  legalActionPrimaryInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legalActionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  legalActionPrimaryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  linkText: {
    textDecorationLine: 'underline',
  },
  handoffOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  handoffTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  handoffSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
