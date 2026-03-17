import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { RootStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import { useTheme } from '../../context/ThemeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { withOpacity } from '../../utils/color';
import type { AppTheme } from '../../theme/tokens';
import { logEvent } from '../../services/sentry';
import { navigateToSupportPortal } from '../../navigation/rootNavigator';
import OnboardingChoiceInfoModal from '../../components/common/OnboardingChoiceInfoModal';

type OnboardingChoiceTarget = 'OnboardingProfile' | 'OnboardingInviteCode';

const cards = [
  {
    id: 'start',
    title: 'Set Up Protection',
    subtitle: 'Create a new protected profile',
    icon: 'shield-checkmark-outline',
    variant: 'primary' as const,
    target: 'OnboardingProfile' as OnboardingChoiceTarget,
  },
  {
    id: 'join',
    title: 'I Have an Invite Code',
    subtitle: 'Join an existing family or facility setup',
    icon: 'person-add-outline',
    variant: 'secondary' as const,
    target: 'OnboardingInviteCode' as OnboardingChoiceTarget,
  },
];

export default function OnboardingChoiceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'OnboardingChoice'>>();
  const insets = useSafeAreaInsets();
  const { theme, mode } = useTheme();
  const { membershipActivationNotice } = useSubscription();
  const styles = useMemo(() => createChoiceStyles(theme), [theme]);
  const [showSetupHelp, setShowSetupHelp] = useState(false);

  useEffect(() => {
    logEvent('onboarding_started', { screen: 'OnboardingChoice' });
  }, []);

  useEffect(() => {
    if (!membershipActivationNotice) {
      return;
    }
    navigation.replace('MembershipActivated');
  }, [membershipActivationNotice, navigation]);

  const handlePress = (target: OnboardingChoiceTarget) => {
    logEvent('onboarding_choice_selected', {
      screen: 'OnboardingChoice',
      extra: { target },
    });
    navigation.navigate(target);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <OnboardingHeader chapter="setup" activeStep={1} totalSteps={6} showBack={false} />
        <ScrollView
          contentContainerStyle={[
            styles.body,
            {
              paddingTop: 28,
              flexGrow: 1,
              paddingBottom: Math.max(insets.bottom, 32) + 220,
            },
          ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>How are you setting up today?</Text>
            <Pressable
              style={({ pressed }) => [styles.helpButton, pressed && styles.helpButtonPressed]}
              onPress={() => setShowSetupHelp(true)}
              hitSlop={8}
            >
              <Ionicons name="help-circle-outline" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            If you just subscribed, choose Set Up Protection.
          </Text>
        </View>

        <View style={styles.cards}>
          {cards.map((card, index) => (
            <Pressable
              key={card.id}
              style={({ pressed }) => [
                styles.card,
                card.variant === 'primary' ? styles.cardPrimary : styles.cardSecondary,
                pressed && styles.cardPressed,
                index !== cards.length - 1 && styles.cardSpacing,
              ]}
              onPress={() => handlePress(card.target)}
            >
              <View
                style={[
                  styles.iconBox,
                  card.variant === 'primary' ? styles.iconBoxPrimary : styles.iconBoxSecondary,
                ]}
              >
          <Ionicons
            name={card.icon as any}
            size={28}
            color={card.variant === 'primary' ? theme.colors.surface : theme.colors.accent}
          />
              </View>
              <View style={styles.textStack}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={24} color={withOpacity(theme.colors.textMuted, 0.35)} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footerCard,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
            shadowColor: theme.colors.border,
          },
        ]}
      >
        <Text style={styles.footerCaption}>Need help deciding?</Text>
        <Pressable
          onPress={navigateToSupportPortal}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Speak with our team"
        >
          <Text style={[styles.footerLink, { color: theme.colors.accent }]}>Speak with our team</Text>
        </Pressable>
      </View>
      <OnboardingChoiceInfoModal
        visible={showSetupHelp}
        onClose={() => setShowSetupHelp(false)}
        theme={theme}
        mode={mode}
      />
    </SafeAreaView>
  );
}

const createChoiceStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
      justifyContent: 'flex-start',
    },
    body: {
      paddingHorizontal: 32,
      paddingBottom: 160,
    },
    header: {
      marginBottom: 32,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    title: {
      fontSize: 34,
      fontWeight: '700',
      color: theme.colors.text,
      letterSpacing: -0.35,
      lineHeight: 38,
      maxWidth: 320,
      flex: 1,
    },
    subtitle: {
      fontSize: 17,
      fontWeight: '500',
      color: theme.colors.textMuted,
      marginTop: 10,
      maxWidth: 320,
    },
    helpButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    helpButtonPressed: {
      opacity: 0.75,
      transform: [{ scale: 0.95 }],
    },
    cards: {
      flexDirection: 'column',
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 32,
      minHeight: 80,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: theme.colors.border,
      shadowOpacity: 0.15,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
    },
    cardPrimary: {
      borderColor: theme.colors.border,
    },
    cardSecondary: {
      borderColor: theme.colors.border,
    },
    cardPressed: {
      transform: [{ scale: 0.97 }],
      opacity: 0.95,
    },
    iconBox: {
      width: 64,
      height: 64,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    iconBoxPrimary: {
      backgroundColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
    },
    iconBoxSecondary: {
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    textStack: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    cardSubtitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textMuted,
      marginTop: 4,
    },
    footerCard: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: -2,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      paddingHorizontal: 32,
      paddingTop: 20,
      borderWidth: 1,
      shadowOpacity: 0.25,
      shadowOffset: { width: 0, height: -12 },
      shadowRadius: 40,
      elevation: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardSpacing: {
      marginBottom: 20,
    },
    footerCaption: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    footerLink: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.accent,
      marginTop: 4,
      textAlign: 'center',
    },
  });
