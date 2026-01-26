import { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';

import { useTheme } from '../../context/ThemeContext';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { supabase } from '../../services/supabase';
import type { AppTheme } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { RouteProp, NavigationProp } from '@react-navigation/native';

type ConfirmEmailRouteProp = RouteProp<RootStackParamList, 'ConfirmEmail'>;
type ConfirmEmailNavigationProp = NavigationProp<RootStackParamList, 'ConfirmEmail'>;

type Props = {
  route: ConfirmEmailRouteProp;
  navigation: ConfirmEmailNavigationProp;
};

export default function ConfirmEmailScreen({ route, navigation }: Props) {
  const { email } = route.params;
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createConfirmEmailStyles(theme), [theme]);
  const topInset = Math.max(insets.top + theme.spacing.md, theme.spacing.xl);
  const bottomInset = Math.max(insets.bottom, theme.spacing.lg);
  const footerBuffer = bottomInset + theme.spacing.xxl + theme.spacing.xxl + 80;
  const [resendState, setResendState] = useState<null | { type: 'success' | 'error'; message: string }>(null);
  const [isResending, setIsResending] = useState(false);

  const handleResendEmail = useCallback(async () => {
    setIsResending(true);
    setResendState(null);
    const { error } = await supabase.auth.resend({
      email,
      type: 'signup',
      options: {
        emailRedirectTo: 'exp://192.168.1.174:8081/--/auth/callback',
      },
    });
    if (error) {
      setResendState({ type: 'error', message: error.message });
    } else {
      setResendState({
        type: 'success',
        message: `We just sent another confirmation link to ${email}.`,
      });
    }
    setIsResending(false);
  }, [email]);

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
              <Ionicons name="mail-open-outline" size={60} color={theme.colors.surface} />
            </View>
            <Text style={styles.title}>Almost there</Text>
            <Text style={styles.subtitle}>An email is on its way to:</Text>
            <Text style={styles.email}>{email}</Text>
          </View>
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Next steps</Text>
            <View style={styles.stepRow}>
              <Text style={styles.stepBullet}>•</Text>
              <Text style={styles.stepText}>Open your inbox and find the message we just sent.</Text>
            </View>
            <View style={styles.stepRow}>
              <Text style={styles.stepBullet}>•</Text>
              <Text style={styles.stepText}>Tap the “Confirm email” link—this will bring you back here.</Text>
            </View>
            <View style={styles.stepRow}>
              <Text style={styles.stepBullet}>•</Text>
              <Text style={styles.stepText}>When you see this page again, tap “Continue to sign in.”</Text>
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
                isResending && styles.resendButtonLoading,
              ]}
              onPress={handleResendEmail}
              disabled={isResending}
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
        </ScrollView>
        <ActionFooter
          primaryLabel="Continue to sign in"
          onPrimaryPress={() => navigation.navigate('SignIn')}
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
    },
    email: {
      marginTop: 0,
      color: theme.colors.text,
      fontWeight: '600',
      fontSize: 16,
    },
    stepCard: {
      width: '100%',
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radii.md,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
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
