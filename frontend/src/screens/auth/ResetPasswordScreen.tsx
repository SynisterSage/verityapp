import { useCallback, useMemo } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import { useTheme } from '../../context/ThemeContext';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { logEvent } from '../../services/sentry';
import type { AppTheme } from '../../theme/tokens';
import type { NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';

type ResetPasswordNavigationProp = NavigationProp<RootStackParamList, 'ResetPassword'>;

const copy = {
  title: 'Reset your password',
  subtitle:
    'We sent a secure reset link to your inbox. Tap the button below to open the app and finish setting a new password.',
  footer: 'Link expires in 30 minutes. If the button doesn’t work, try again from the email.',
};

export default function ResetPasswordScreen({ navigation }: { navigation: ResetPasswordNavigationProp }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top + theme.spacing.md, theme.spacing.xl);

  const handleDone = useCallback(() => {
    logEvent('reset_password_return_to_sign_in', { screen: 'ResetPassword' });
    navigation.navigate('SignIn');
  }, [navigation]);

  return (
    <View style={styles.outer}>
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={[styles.card, { marginTop: topPadding }] }>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.subtitle}</Text>
        </View>
        <View style={styles.footerTextWrapper}>
          <Text style={styles.footerText}>{copy.footer}</Text>
        </View>
        <ActionFooter
          primaryLabel="Return to sign in"
          onPrimaryPress={handleDone}
        />
      </SafeAreaView>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    outer: { flex: 1, backgroundColor: theme.colors.bg },
    screen: { flex: 1, paddingHorizontal: theme.spacing.lg },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.xl,
      padding: theme.spacing.xl,
      alignItems: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
    },
    subtitle: {
      marginTop: theme.spacing.md,
      fontSize: 16,
      color: theme.colors.textDim,
      textAlign: 'center',
    },
    footerTextWrapper: {
      marginTop: theme.spacing.xl,
      alignItems: 'center',
    },
    footerText: {
      color: theme.colors.textDim,
      fontSize: 14,
      textAlign: 'center',
    },
  });
