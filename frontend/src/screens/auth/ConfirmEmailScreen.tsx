import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, ScrollView, Pressable, AppState, AppStateStatus } from 'react-native';

import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { supabase } from '../../services/supabase';
import { logEvent } from '../../services/sentry';
import type { AppTheme } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { RouteProp, NavigationProp } from '@react-navigation/native';

type ConfirmEmailRouteProp = RouteProp<RootStackParamList, 'ConfirmEmail'>;
type ConfirmEmailNavigationProp = NavigationProp<RootStackParamList, 'ConfirmEmail'>;

type Props = {
  route: ConfirmEmailRouteProp;
  navigation: ConfirmEmailNavigationProp;
};

const RESEND_LIMIT = 5;
const RESEND_WINDOW_MS = 30 * 60 * 1000;
const EMAIL_CONFIRM_REDIRECT_TO = 'verityprotect://auth/callback';

export default function ConfirmEmailScreen({ route, navigation }: Props) {
  const { email: routeEmail, confirmed } = route.params;
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createConfirmEmailStyles(theme), [theme]);
  const topInset = Math.max(insets.top + theme.spacing.md, theme.spacing.xl);
  const bottomInset = Math.max(insets.bottom, theme.spacing.sm);
  const footerBuffer = bottomInset + theme.spacing.xxl + theme.spacing.xxl + 60;
  const [resendState, setResendState] = useState<null | { type: 'success' | 'error'; message: string }>(null);
  const [isResending, setIsResending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [resendHistory, setResendHistory] = useState<number[]>([]);
  const email = routeEmail ?? '';
  const [emailConfirmed, setEmailConfirmed] = useState(confirmed ?? false);
  const appState = useRef(AppState.currentState);

  const showSuccess = emailConfirmed;

  const checkEmailConfirmation = useCallback(
    async (reason: 'mount' | 'foreground' | 'manual' | 'session') => {
      if (emailConfirmed) {
        return true;
      }
      setIsChecking(true);
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        const sessionToCheck = currentSession ?? session;
        const confirmedViaSession = Boolean(sessionToCheck?.user?.email_confirmed_at);

        if (confirmedViaSession) {
          setEmailConfirmed(true);
          logEvent('confirm_email_detected_confirmed', {
            screen: 'ConfirmEmail',
            extra: { reason },
          });
          return true;
        }

        return false;
      } catch (error) {
        console.warn('Failed to check email confirmation:', error);
        return false;
      } finally {
        setIsChecking(false);
      }
    },
    [emailConfirmed, session]
  );

  // Update confirmed state when route params or session change.
  useEffect(() => {
    if (confirmed) {
      setEmailConfirmed(true);
      return;
    }
    if (session?.user?.email_confirmed_at) {
      setEmailConfirmed(true);
    }
  }, [confirmed, session?.user?.email_confirmed_at]);

  // Check confirmation on mount and when returning to app foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        setTimeout(() => {
          void checkEmailConfirmation('foreground');
        }, 350);
      }
      appState.current = nextAppState;
    });

    void checkEmailConfirmation('mount');

    return () => {
      subscription.remove();
    };
  }, [checkEmailConfirmation]);

  // If auth session is updated from callback while this screen is open, re-check once.
  useEffect(() => {
    if (!session) {
      return;
    }
    void checkEmailConfirmation('session');
  }, [checkEmailConfirmation, session]);

  const cleanHistory = (timestamps: number[], now = Date.now()) =>
    timestamps.filter((ts) => now - ts < RESEND_WINDOW_MS);
  const isRateLimited = useMemo(
    () => cleanHistory(resendHistory).length >= RESEND_LIMIT,
    [resendHistory]
  );

  const handleRateLimit = useCallback(() => {
    setResendState({
      type: 'error',
      message: 'You can request up to 5 resends per 30 minutes. Please try again later.',
    });
    logEvent('confirm_email_resend_rate_limited', {
      level: 'warning',
      screen: 'ConfirmEmail',
    });
  }, []);
  const handleResendEmail = useCallback(async () => {
    const now = Date.now();
    const recent = cleanHistory(resendHistory, now);
    setResendHistory(recent);
    if (recent.length >= RESEND_LIMIT) {
      handleRateLimit();
      return;
    }
    setIsResending(true);
    setResendState(null);
    logEvent('confirm_email_resend_requested', { screen: 'ConfirmEmail' });
    const { error } = await supabase.auth.resend({
      email,
      type: 'signup',
      options: {
        emailRedirectTo: EMAIL_CONFIRM_REDIRECT_TO,
      },
    });
    if (error) {
      setResendState({ type: 'error', message: error.message });
      logEvent('confirm_email_resend_failed', {
        level: 'warning',
        screen: 'ConfirmEmail',
        extra: { reason: error.message },
      });
    } else {
      setResendState({
        type: 'success',
        message: `We just sent another confirmation link to ${email}.`,
      });
      setResendHistory((prev) => [...recent, now]);
      logEvent('confirm_email_resend_success', { screen: 'ConfirmEmail' });
    }
    setIsResending(false);
  }, [email, handleRateLimit, resendHistory]);

  const handleContinue = useCallback(() => {
    logEvent('confirm_email_continue_to_sign_in', { screen: 'ConfirmEmail' });
    navigation.navigate('SignIn');
  }, [navigation]);

  return (
    <View style={styles.outer}>
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: topInset,
              paddingBottom: footerBuffer,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.badge}>
              <Ionicons
                name={showSuccess ? 'checkmark-circle-outline' : 'mail-open-outline'}
                size={60}
                color={theme.colors.surface}
              />
            </View>
            <Text style={styles.title}>{showSuccess ? 'Email confirmed' : 'Almost there'}</Text>
            <Text style={styles.subtitle}>
              {showSuccess
                ? 'Your email is verified. Head back to sign in and finish setting up your secure account.'
                : 'An email is on its way to:'}
            </Text>
            {!showSuccess && <Text style={styles.email}>{email}</Text>}
          </View>
          {showSuccess ? (
            <View style={styles.stepCard}>
              <Text style={styles.stepTitle}>You’re all set</Text>
              <Text style={styles.stepText}>
                Thanks for confirming your email. Tap “Return to sign in” to complete your login.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.stepCard}>
                <Text style={styles.stepTitle}>Next steps</Text>
                <View style={styles.stepRow}>
                  <Text style={styles.stepBullet}>•</Text>
                  <Text style={styles.stepText}>Open your inbox and find the message we just sent.</Text>
                </View>
                <View style={styles.stepRow}>
                  <Text style={styles.stepBullet}>•</Text>
                  <Text style={styles.stepText}>Tap the “Confirm email” link. It will bring you back here.</Text>
                </View>
                <View style={styles.stepRow}>
                  <Text style={styles.stepBullet}>•</Text>
                  <Text style={styles.stepText}>After the page reloads, tap “Continue to sign in.”</Text>
                </View>
              </View>
              <View style={styles.helpCard}>
                <Text style={styles.helpTitle}>Need a hand?</Text>
                <Text style={styles.helpText}>
                  Confirmation emails usually appear within a minute. Keep this screen open while you check your inbox and spam folder.
                </Text>
                <Text style={styles.helpText}>
                  Still nothing? Tap “Resend email” and we’ll send a fresh link right away.
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.resendButton,
                    pressed && styles.resendButtonPressed,
                    isChecking && styles.resendButtonLoading,
                  ]}
                  onPress={() => {
                    void checkEmailConfirmation('manual');
                  }}
                  disabled={isChecking}
                >
                  <Text style={styles.resendButtonText}>
                    {isChecking ? 'Checking…' : 'I confirmed, check again'}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.resendButton,
                    pressed && styles.resendButtonPressed,
                    isResending && styles.resendButtonLoading,
                  ]}
                  onPress={handleResendEmail}
                  disabled={isResending || isRateLimited}
                >
                  <Text style={styles.resendButtonText}>{isResending ? 'Resending…' : 'Resend email'}</Text>
                </Pressable>
                {resendState ? (
                  <Text
                    style={[
                      styles.resendFeedback,
                      resendState.type === 'error' ? styles.feedbackError : styles.feedbackSuccess,
                    ]}
                  >
                    {resendState.message}
                  </Text>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>
        <ActionFooter
          primaryLabel={showSuccess ? 'Return to sign in' : 'Continue to sign in'}
          onPrimaryPress={handleContinue}
        />
      </SafeAreaView>
    </View>
  );
}

const createConfirmEmailStyles = (theme: AppTheme) =>
  StyleSheet.create({
    outer: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    content: {
      flexGrow: 1,
      minHeight: '100%',
      paddingHorizontal: theme.spacing.lg,
      gap: theme.spacing.md,
      alignItems: 'center',
    },
    header: {
      width: '100%',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    badge: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.md,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.textDim,
      textAlign: 'center',
      marginTop: -10,
    },
    email: {
      marginTop: 0,
      color: theme.colors.text,
      fontWeight: '600',
      fontSize: 16,
      marginBottom: 20,
    },
    stepCard: {
      width: '100%',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
      gap: theme.spacing.sm,
      borderColor: theme.colors.border,
      borderWidth: 1,
    },
    stepTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.sm,
    },
    stepBullet: {
      color: theme.colors.accent,
      fontSize: 18,
      lineHeight: 24,
    },
    stepText: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.text,
      lineHeight: 20,
    },
    scrollView: {
      flex: 1,
    },
    helpCard: {
      width: '100%',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: theme.spacing.xxl,
    },
    helpTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    helpText: {
      fontSize: 14,
      color: theme.colors.textDim,
      lineHeight: 20,
    },
    resendButton: {
      marginTop: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    resendButtonPressed: {
      opacity: 0.8,
    },
    resendButtonLoading: {
      opacity: 0.6,
    },
    resendButtonText: {
      color: theme.colors.accent,
      fontWeight: '600',
      fontSize: 16,
    },
    resendFeedback: {
      marginTop: theme.spacing.xs,
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'center',
    },
    feedbackError: {
      color: theme.colors.danger,
    },
    feedbackSuccess: {
      color: theme.colors.success,
    },
  });
