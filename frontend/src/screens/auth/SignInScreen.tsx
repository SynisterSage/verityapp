import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { logEvent } from '../../services/sentry';
import { MEMBERSHIP_SIGNOUT_NOTE_KEY } from '../../utils/membership';
import { FALLBACK_LEGAL_VERSIONS } from '../../services/legal';
import { withOpacity } from '../../utils/color';
import type { RootStackParamList } from '../../navigation/types';

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

export default function SignInScreen({
  navigation,
  route,
}: {
  navigation: any;
  route?: { params?: RootStackParamList['SignIn'] };
}) {
  const { signIn, signInWithGoogle, signInWithApple, sendPasswordReset } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<null | { text: string; type: 'error' | 'info' }>(null);
  const [focusField, setFocusField] = useState<'email' | 'password' | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [membershipNoteVisible, setMembershipNoteVisible] = useState(false);
  const [isDismissingMembershipNote, setIsDismissingMembershipNote] = useState(false);
  const insets = useSafeAreaInsets();
  const isFacilityClaimPromptVisible = Boolean(route?.params?.facilityClaimPrompt);
  const facilityNameFromPrompt = formatFacilityNameFromSlug(route?.params?.facilitySlug);
  const isInviteClaimPromptVisible = Boolean(route?.params?.inviteClaimPrompt);
  const isViewPlansPromptVisible = Boolean(route?.params?.viewPlansPrompt);

  useEffect(() => {
    let mounted = true;
    const loadMembershipNote = async () => {
      try {
        const value = await AsyncStorage.getItem(MEMBERSHIP_SIGNOUT_NOTE_KEY);
        if (mounted && value === '1') {
          setMembershipNoteVisible(true);
        }
      } catch {
        // no-op
      }
    };
    void loadMembershipNote();
    return () => {
      mounted = false;
    };
  }, []);

  const dismissMembershipNote = async () => {
    if (isDismissingMembershipNote) return;
    setIsDismissingMembershipNote(true);
    try {
      await AsyncStorage.removeItem(MEMBERSHIP_SIGNOUT_NOTE_KEY);
    } finally {
      setMembershipNoteVisible(false);
      setIsDismissingMembershipNote(false);
    }
  };
  const handleSubmit = async () => {
    setLoginError('');
    setIsSubmitting(true);
    logEvent('login_attempt', { screen: 'SignIn' });
    const message = await signIn(email.trim(), password);
    if (message) {
      setLoginError(message);
      logEvent('login_failed', {
        level: 'warning',
        screen: 'SignIn',
        extra: { reason: message },
      });
    } else {
      logEvent('login_success', { screen: 'SignIn' });
    }
    setIsSubmitting(false);
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setResetMessage({ text: 'Enter your email to reset the password.', type: 'error' });
      logEvent('password_reset_failed', {
        level: 'warning',
        screen: 'SignIn',
        extra: { reason: 'missing_email' },
      });
      return;
    }
    setIsResetting(true);
    logEvent('password_reset_requested', { screen: 'SignIn' });
    const error = await sendPasswordReset(email.trim());
    if (error) {
      setResetMessage({ text: error, type: 'error' });
      logEvent('password_reset_failed', {
        level: 'warning',
        screen: 'SignIn',
        extra: { reason: error },
      });
    } else {
      setResetMessage({
        text: 'If an account exists for this email, password reset instructions were sent.',
        type: 'info',
      });
      logEvent('password_reset_success', { screen: 'SignIn' });
    }
    setIsResetting(false);
  };

  const handleGoogleSignIn = async () => {
    logEvent('login_google_attempt', { screen: 'SignIn' });
    await signInWithGoogle();
  };

  const handleAppleSignIn = async () => {
    setLoginError('');
    logEvent('login_apple_attempt', { screen: 'SignIn' });
    const message = await signInWithApple();
    if (message) {
      setLoginError(message);
      logEvent('login_apple_failed', {
        level: 'warning',
        screen: 'SignIn',
        extra: { reason: message },
      });
    }
  };

  const inputBorderColor = (field: 'email' | 'password') =>
    focusField === field ? theme.colors.accent : theme.colors.border;
  const isPrimaryDisabled = isSubmitting || !email.trim() || !password.trim();

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
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={[styles.title, { color: theme.colors.text, fontFamily: theme.typography.fontFamily }]}>
            Welcome Back
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: theme.colors.textMuted, fontFamily: theme.typography.fontFamily },
            ]}
          >
            Sign into your Verity account.
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
                Sign in required to claim facility partnership
              </Text>
              <Text style={[styles.facilityClaimBody, { color: theme.colors.textMuted }]}>
                {facilityNameFromPrompt
                  ? `Continue signing in to claim ${facilityNameFromPrompt}'s partner offer.`
                  : 'Continue signing in to claim your facility partner offer.'}
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
                Sign in required to join this circle
              </Text>
              <Text style={[styles.facilityClaimBody, { color: theme.colors.textMuted }]}>
                Continue signing in and we'll prefill your invite code automatically.
              </Text>
            </View>
          </View>
        ) : null}

        {isViewPlansPromptVisible ? (
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
              <Ionicons name="pricetag-outline" size={14} color={theme.colors.accent} />
            </View>
            <View style={styles.facilityClaimTextWrap}>
              <Text style={[styles.facilityClaimTitle, { color: theme.colors.text }]}>
                Sign in required to view plans
              </Text>
              <Text style={[styles.facilityClaimBody, { color: theme.colors.textMuted }]}>
                Continue signing in to view and choose your Verity membership plan.
              </Text>
            </View>
          </View>
        ) : null}

        {membershipNoteVisible ? (
          <View
            style={[
              styles.membershipNote,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <View style={styles.membershipNoteHeader}>
              <Text style={[styles.membershipNoteTitle, { color: theme.colors.text }]}>
                Thanks for checking out Verity
              </Text>
              <Pressable
                onPress={() => {
                  void dismissMembershipNote();
                }}
                hitSlop={8}
                style={styles.membershipNoteClose}
              >
                {isDismissingMembershipNote ? (
                  <ActivityIndicator size="small" color={theme.colors.textMuted} />
                ) : (
                  <Ionicons name="close" size={15} color={theme.colors.textMuted} />
                )}
              </Pressable>
            </View>
            <Text style={[styles.membershipNoteBody, { color: theme.colors.textMuted }]}>
              Come back anytime.
            </Text>
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
          </View>

          <View style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: theme.colors.textDim }]}>Password</Text>
            <View style={styles.passwordRow}>
            <TextInput
                placeholder="••••••••"
                placeholderTextColor={theme.colors.textDim}
                secureTextEntry={!showPassword}
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
                <Svg
                  width={22}
                  height={22}
                  viewBox="0 0 24 24"
                  style={styles.eyeIcon}
                  fill="none"
                  stroke={showPassword ? theme.colors.accent : theme.colors.textMuted}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                  <Path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                  {showPassword ? null : <Path d="M4 4l16 16" />}
                </Svg>
              </Pressable>
            </View>
          </View>

        <TouchableOpacity
          style={[styles.forgotButton, { alignSelf: 'flex-end' }]}
          onPress={handlePasswordReset}
        >
          <Text style={[styles.forgotText, { color: theme.colors.accent, opacity: isResetting ? 0.6 : 1 }]}>
            {isResetting ? 'Sending reset link…' : 'Forgot Password?'}
          </Text>
        </TouchableOpacity>
        {resetMessage ? (
          <View
            style={[
              styles.resetMessage,
              {
                borderColor:
                  resetMessage.type === 'error' ? theme.colors.danger : theme.colors.success,
                backgroundColor:
                  resetMessage.type === 'error'
                    ? withOpacity(theme.colors.danger, 0.08)
                    : withOpacity(theme.colors.success, 0.08),
              },
            ]}
          >
            <Text
              style={[
                styles.resetMessageText,
                {
                  color: resetMessage.type === 'error' ? theme.colors.danger : theme.colors.success,
                },
              ]}
            >
              {resetMessage.text}
            </Text>
          </View>
        ) : null}
        {loginError ? (
          <View
            style={[
              styles.loginError,
              {
                borderColor: theme.colors.danger,
                backgroundColor: withOpacity(theme.colors.danger, 0.08),
              },
            ]}
          >
            <Text style={[styles.loginErrorText, { color: theme.colors.danger }]}>{loginError}</Text>
          </View>
        ) : null}
        </View>
      </ScrollView>

      <ActionFooter
        primaryLabel={isSubmitting ? 'Signing In…' : 'Sign In'}
        onPrimaryPress={handleSubmit}
        primaryLoading={isSubmitting}
        primaryDisabled={isPrimaryDisabled}
        secondaryLabel="Apple"
        onSecondaryPress={handleAppleSignIn}
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
        onTertiaryPress={handleGoogleSignIn}
        tertiaryIcon={
          <View style={[styles.googleIcon, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.googleIconText, { color: theme.colors.accent }]}>G</Text>
          </View>
        }
        helperPrefix="New to Verity?"
        helperActionLabel="Join Now"
        onHelperPress={() =>
          navigation.navigate(
            'SignUp',
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
          logEvent('signin_how_it_works_opened', { screen: 'SignIn' });
          navigation.navigate('MembershipExperience', { source: 'auth', origin: 'signin' });
        }}
        subHelperSecondaryLabel="Why choose Verity"
        onSubHelperSecondaryPress={() => {
          logEvent('signin_why_choose_opened', { screen: 'SignIn' });
          navigation.navigate('WhyChooseVerity');
        }}
        legalPrivacyLabel="Privacy Policy"
        onLegalPrivacyPress={() => {
          void Linking.openURL(FALLBACK_LEGAL_VERSIONS.privacyUrl).catch(() => null);
        }}
        legalTermsLabel="Terms of Use"
        onLegalTermsPress={() => {
          void Linking.openURL(FALLBACK_LEGAL_VERSIONS.termsUrl).catch(() => null);
        }}
      />
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
    marginTop: 20,
    marginBottom: 36,
  },
  facilityClaimPrompt: {
    marginTop: 14,
    marginBottom: 6,
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
  membershipNote: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  membershipNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  membershipNoteTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  membershipNoteClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  membershipNoteBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  fieldWrapper: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  input: {
    height: 60,
    borderWidth: 1,
    borderRadius: 24,
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
  eyeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  forgotButton: {
    marginTop: 2,
  },
  forgotText: {
    fontSize: 15,
    fontWeight: '700',
  },
  resetMessage: {
    fontSize: 12,
    marginTop: 12,
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  resetMessageText: {
    fontSize: 12,
  },
  error: {
    fontSize: 12,
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
  loginError: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    backgroundColor: 'rgba(225, 29, 72, 0.08)',
    marginTop: 14,
  },
  loginErrorText: {
    fontSize: 14,
  },
  eyeIcon: {
    marginRight: 4,
  },
});
