import { useMemo } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import ActionFooter from '../../components/onboarding/ActionFooter';
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

  return (
    <View style={styles.outer}>
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 32) + 120 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Ionicons
            name="mail-open-outline"
            size={48}
            color={theme.colors.accent}
            style={styles.icon}
          />
          <Text style={styles.title}>Confirm your email</Text>
          <Text style={styles.subtitle}>
            We just sent a confirmation link to the email below. Open it to finish creating your
            account.
          </Text>
          <Text style={styles.email}>{email}</Text>
          <Text style={styles.body}>
            When you tap the link, Supabase will redirect back to this app via your configured
            deep link (e.g. <Text style={styles.inlineCode}>verity-protect://auth/callback</Text>).
            If the app does not open automatically, return here and tap “Continue to sign in.”
          </Text>
          <Text style={styles.body}>
            If you don’t see the message, check your spam folder or resend the verification from
            Supabase—some delays can happen.
          </Text>
        </ScrollView>
        <ActionFooter
          primaryLabel="Continue to sign in"
          onPrimaryPress={() => navigation.navigate('SignIn')}
          secondaryLabel="Back to sign in"
          onSecondaryPress={() => navigation.navigate('SignIn')}
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
      flex: 1,
      paddingTop: 48,
      paddingHorizontal: theme.spacing.lg,
      gap: theme.spacing.md,
      alignItems: 'center',
    },
    icon: {
      marginBottom: theme.spacing.sm,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    email: {
      marginTop: theme.spacing.sm,
      color: theme.colors.text,
      fontWeight: '600',
      fontSize: 16,
    },
    body: {
      fontSize: 14,
      color: theme.colors.textDim,
      textAlign: 'center',
    },
    inlineCode: {
      fontWeight: '600',
      color: theme.colors.text,
    },
  });
