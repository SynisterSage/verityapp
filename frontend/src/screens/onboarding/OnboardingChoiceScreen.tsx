import { View, StyleSheet, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { RootStackParamList } from '../../navigation/types';
import OnboardingHeader from '../../components/onboarding/OnboardingHeader';
import { useTheme } from '../../context/ThemeContext';

type OnboardingChoiceTarget = 'OnboardingProfile' | 'OnboardingInviteCode';

const cards = [
  {
    id: 'start',
    title: 'Start Fresh',
    subtitle: 'Set up new protection',
    icon: 'shield-checkmark-outline',
    variant: 'primary' as const,
    target: 'OnboardingProfile' as OnboardingChoiceTarget,
  },
  {
    id: 'join',
    title: 'Join Circle',
    subtitle: 'Use an invitation code',
    icon: 'person-add-outline',
    variant: 'secondary' as const,
    target: 'OnboardingInviteCode' as OnboardingChoiceTarget,
  },
];

export default function OnboardingChoiceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'OnboardingChoice'>>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const handlePress = (target: OnboardingChoiceTarget) => {
    navigation.navigate(target);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <OnboardingHeader chapter="setup" activeStep={2} showBack={false} />
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
          <Text style={styles.title}>How would you like to start?</Text>
          <Text style={styles.subtitle}>
            Simple protection, tailored to your needs.
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
                  color={card.variant === 'primary' ? '#fff' : '#2d6df6'}
                />
              </View>
              <View style={styles.textStack}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={24} color="rgba(255,255,255,0.2)" />
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
        <Text style={[styles.footerLink, { color: theme.colors.accent }]}>Speak with our team</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b111b',
    justifyContent: 'flex-start',
  },
  body: {
    paddingHorizontal: 32,
    paddingBottom: 160,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#f5f7fb',
    letterSpacing: -0.35,
    lineHeight: 38,
    maxWidth: 320,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#8aa0c6',
    marginTop: 8,
    maxWidth: 320,
  },
  cards: {
    flexDirection: 'column',
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 32,
    minHeight: 80,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f2a3a',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  cardPrimary: {
    borderColor: '#1f2a3a',
  },
  cardSecondary: {
    borderColor: '#1f2a3a',
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
    backgroundColor: '#2d6df6',
    shadowColor: '#2d6df6',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  iconBoxSecondary: {
    backgroundColor: '#0b111b',
    borderWidth: 1,
    borderColor: '#2d6df6',
  },
  textStack: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f5f7fb',
  },
  cardSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8aa0c6',
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
    color: '#8796b0',
    textAlign: 'center',
  },
  footerLink: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d6df6',
    marginTop: 4,
    textAlign: 'center',
  },
});
