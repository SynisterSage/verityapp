import { useEffect, useMemo, useRef } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import type { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../context/ThemeContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';
import { logEvent } from '../../services/sentry';

const riskStats = [
  {
    value: '$12.5B',
    title: 'Reported U.S. fraud losses in 2024',
    source: 'Federal Trade Commission (FTC)',
  },
  {
    value: '#2',
    title: 'Phone calls were the second most reported contact method',
    source: 'FTC fraud reporting trends',
  },
  {
    value: 'Nearly $4.8B',
    title: 'Losses reported by people age 60+ in 2024',
    source: 'FBI IC3 Annual Report',
  },
] as const;

const useCases = [
  {
    icon: 'home-outline' as const,
    title: 'Older adults living independently',
    copy: 'Keep daily calls simple while reducing scam pressure and rushed decisions.',
  },
  {
    icon: 'people-outline' as const,
    title: 'Family caregivers managing remotely',
    copy: 'Shared call visibility helps family members review risk quickly and stay aligned.',
  },
  {
    icon: 'business-outline' as const,
    title: 'Facility partnerships and care teams',
    copy: 'Support resident safety with trusted-routing and clear call review workflows.',
  },
  {
    icon: 'call-outline' as const,
    title: 'Works across phone types',
    copy: 'Verity protects a forwarded line, so it can support smartphones, basic phones, and landline-style setups.',
  },
] as const;

const comparisonPoints = [
  {
    icon: 'shield-outline' as const,
    title: 'More than just block or silence',
    copy: 'iPhone call screening can reduce spam, but Verity also adds family review, trusted routing, and shared alerts.',
  },
  {
    icon: 'people-circle-outline' as const,
    title: 'Shared visibility for families',
    copy: 'Other tools protect one phone. Verity lets caregivers and family members see what happened and respond together.',
  },
  {
    icon: 'document-text-outline' as const,
    title: 'Actionable call context',
    copy: 'Instead of a missed call only, Verity provides transcript snippets and risk markers so people can make safer decisions.',
  },
  {
    icon: 'swap-horizontal-outline' as const,
    title: 'Reliable fallback coverage',
    copy: 'Because protection sits on the forwarded line, coverage continues as a dependable fallback even when someone changes devices.',
  },
  {
    icon: 'options-outline' as const,
    title: 'Expanded controls when you need them',
    copy: 'Use Safe Phrases, Trusted Contacts, blocked contacts, and automation settings to tune how calls are screened for each household.',
  },
] as const;

const caregiverPoints = [
  'Know when a risky call was blocked without asking your parent to explain every detail.',
  'Review suspicious calls quickly and decide together what to do next.',
  'Keep independence in place while adding backup for high-pressure scam moments.',
] as const;

const scenarioCases = [
  {
    title: 'Bank impersonation push',
    before:
      'Caller claims a fraud hold and asks for a one-time code “to verify identity” while keeping the person on the line.',
    after:
      'Unknown caller is screened first, the request is flagged as high-risk language, and family can review before any code is shared.',
  },
  {
    title: 'Medicare or pharmacy callback trap',
    before:
      'A spoofed callback asks for Medicare ID, date of birth, and card details to “fix coverage today.”',
    after:
      'Verity captures context, routes trusted numbers normally, and gives caregivers a clear review trail before sensitive info is given.',
  },
  {
    title: 'Utility shutoff urgency',
    before:
      'Scammer pressures immediate payment by gift card or wire, threatening service shutoff within minutes.',
    after:
      'High-pressure payment language is surfaced quickly so families can pause, verify through trusted contacts, and avoid panic payments.',
  },
] as const;

const socialLinks = [
  { label: 'Website', url: 'https://www.verityprotect.com/' },
  { label: 'X', url: 'https://x.com/VerityProtect' },
  { label: 'Instagram', url: 'https://instagram.com/VerityProtect' },
  { label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61586541604181' },
] as const;

const policyLinks = [
  { label: 'Terms', url: 'https://www.verityprotect.com/terms' },
  { label: 'Privacy', url: 'https://www.verityprotect.com/privacy' },
  { label: 'Email Support', url: 'mailto:support@verityprotect.com' },
] as const;

const sourceLinks = [
  { label: 'FTC 2024 fraud report', url: 'https://www.ftc.gov/news-events/news/press-releases/2025/03/new-ftc-data-show-big-jump-reported-losses-fraud-125-billion-2024' },
  { label: 'FBI IC3 2024 report', url: 'https://www.ic3.gov/Media/PDF/AnnualReport/2024_IC3Report.pdf' },
] as const;

export default function WhyChooseVerityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'WhyChooseVerity'>>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const hasLoggedView = useRef(false);

  useEffect(() => {
    if (hasLoggedView.current) {
      return;
    }
    hasLoggedView.current = true;
    logEvent('membership_why_choose_viewed', {
      screen: 'WhyChooseVerityScreen',
    });
  }, []);

  const openExternalLink = async (url: string, label: string) => {
    void Haptics.selectionAsync().catch(() => null);
    logEvent('membership_why_choose_link_tapped', {
      screen: 'WhyChooseVerityScreen',
      extra: { label, url },
    });

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Link unavailable', 'This link could not be opened on this device.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Link unavailable', 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 14) }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            void Haptics.selectionAsync().catch(() => null);
            navigation.goBack();
          }}
        >
          <Ionicons name="chevron-back" size={17} color={theme.colors.text} style={styles.backIcon} />
        </Pressable>
        <Text style={styles.headerTitle}>Why Choose Verity</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>A calm first line of defense for family phones</Text>
          <Text style={styles.heroCopy}>
            Verity screens unknown callers before they reach your loved one, so urgent money scams
            are less likely to land as high-pressure conversations.
          </Text>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Why this matters now</Text>
          <View style={styles.statsGrid}>
            {riskStats.map((stat) => (
              <View key={stat.title} style={styles.statCard}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statTitle}>{stat.title}</Text>
                <Text style={styles.statSource}>{stat.source}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Real-world scenarios</Text>
          <View style={styles.useCasesWrap}>
            {scenarioCases.map((scenario) => (
              <View key={scenario.title} style={styles.scenarioCard}>
                <Text style={styles.useCaseTitle}>{scenario.title}</Text>
                <Text style={styles.scenarioHeadline}>Before Verity</Text>
                <Text style={styles.scenarioCopy}>{scenario.before}</Text>
                <View style={styles.scenarioDivider} />
                <Text style={styles.scenarioHeadline}>With Verity</Text>
                <Text style={styles.scenarioCopy}>{scenario.after}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Who Verity is for</Text>
          <View style={styles.useCasesWrap}>
            {useCases.map((item) => (
              <View key={item.title} style={styles.useCaseCard}>
                <View style={styles.useCaseIconWrap}>
                  <Ionicons name={item.icon} size={16} color={theme.colors.accent} />
                </View>
                <View style={styles.useCaseTextWrap}>
                  <Text style={styles.useCaseTitle}>{item.title}</Text>
                  <Text style={styles.useCaseCopy}>{item.copy}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>How Verity is different</Text>
          <View style={styles.useCasesWrap}>
            {comparisonPoints.map((item) => (
              <View key={item.title} style={styles.useCaseCard}>
                <View style={styles.useCaseIconWrap}>
                  <Ionicons name={item.icon} size={16} color={theme.colors.accent} />
                </View>
                <View style={styles.useCaseTextWrap}>
                  <Text style={styles.useCaseTitle}>{item.title}</Text>
                  <Text style={styles.useCaseCopy}>{item.copy}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Built for adult children and caregivers</Text>
          <View style={styles.caregiverCard}>
            {caregiverPoints.map((point) => (
              <View key={point} style={styles.caregiverRow}>
                <Ionicons name="checkmark-circle" size={15} color={theme.colors.accent} />
                <Text style={styles.caregiverPoint}>{point}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.supportCard}>
          <Text style={styles.supportTitle}>Need help before purchasing?</Text>
          <Text style={styles.supportCopy}>
            Open billing and support directly from the app, or email our team.
          </Text>
          <View style={styles.supportActionsRow}>
            <Pressable
              style={styles.supportPrimaryButton}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
                navigation.navigate('SupportPortal');
              }}
            >
              <Text style={styles.supportPrimaryText}>Open Support Portal</Text>
            </Pressable>
            <Pressable
              style={styles.supportSecondaryButton}
              onPress={() => {
                void openExternalLink('mailto:support@verityprotect.com', 'Email Support');
              }}
            >
              <Text style={styles.supportSecondaryText}>Email Support</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.facilityCard}>
          <View style={styles.facilityIconWrap}>
            <Ionicons name="business-outline" size={16} color={theme.colors.accent} />
          </View>
          <View style={styles.facilityTextWrap}>
            <Text style={styles.facilityTitle}>Facility partnerships</Text>
            <Text style={styles.facilityCopy}>
              Managing multiple residents or members? We can help you set up Verity for your team.
            </Text>
          </View>
          <Pressable
            style={styles.facilityButton}
            onPress={() => {
              void openExternalLink(
                'mailto:support@verityprotect.com?subject=Facility%20Partnership%20Inquiry',
                'Facility Partnership Email'
              );
            }}
          >
            <Text style={styles.facilityButtonText}>Email us</Text>
          </Pressable>
        </View>

        <View style={styles.linksSection}>
          <Text style={styles.linksLabel}>Connect</Text>
          <View style={styles.linksWrap}>
            {socialLinks.map((link) => (
              <Pressable
                key={link.label}
                style={styles.linkPill}
                onPress={() => {
                  void openExternalLink(link.url, link.label);
                }}
              >
                <Text style={styles.linkPillText}>{link.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.linksLabel}>Policies</Text>
          <View style={styles.linksWrap}>
            {policyLinks.map((link) => (
              <Pressable
                key={link.label}
                style={styles.linkPill}
                onPress={() => {
                  void openExternalLink(link.url, link.label);
                }}
              >
                <Text style={styles.linkPillText}>{link.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sourcesLabel}>Sources</Text>
          <View style={styles.sourcesWrap}>
            {sourceLinks.map((link) => (
              <Pressable
                key={link.label}
                style={styles.sourceRow}
                onPress={() => {
                  void openExternalLink(link.url, link.label);
                }}
              >
                <Text style={styles.sourceText}>{link.label}</Text>
                <Ionicons name="open-outline" size={14} color={theme.colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          style={styles.backToPlansButton}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
            navigation.goBack();
          }}
        >
          <Text style={styles.backToPlansText}>Back to plans</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    headerRow: {
      paddingHorizontal: 24,
      paddingTop: 14,
      paddingBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
    backIcon: {
      marginTop: -1,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    headerSpacer: {
      width: 34,
      height: 34,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 24,
      gap: 18,
    },
    heroCard: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.35),
      backgroundColor: withOpacity(theme.colors.accent, 0.09),
      padding: 16,
      gap: 8,
    },
    heroTitle: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '700',
      color: theme.colors.text,
      letterSpacing: -0.3,
    },
    heroCopy: {
      fontSize: 15,
      lineHeight: 21,
      color: theme.colors.textMuted,
    },
    sectionWrap: {
      gap: 10,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
    },
    statsGrid: {
      gap: 9,
    },
    statCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      gap: 4,
    },
    statValue: {
      fontSize: 20,
      fontWeight: '800',
      color: theme.colors.accent,
      letterSpacing: -0.2,
    },
    statTitle: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },
    statSource: {
      fontSize: 11.5,
      lineHeight: 16,
      color: theme.colors.textMuted,
    },
    scenarioCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      gap: 6,
    },
    scenarioHeadline: {
      fontSize: 12.5,
      fontWeight: '700',
      color: theme.colors.text,
    },
    scenarioCopy: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textMuted,
    },
    scenarioDivider: {
      marginVertical: 2,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    useCasesWrap: {
      gap: 8,
    },
    useCaseCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    useCaseIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
      marginTop: 1,
    },
    useCaseTextWrap: {
      flex: 1,
      gap: 2,
    },
    useCaseTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: theme.colors.text,
    },
    useCaseCopy: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textMuted,
    },
    caregiverCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      gap: 10,
    },
    caregiverRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    caregiverPoint: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.text,
      fontWeight: '600',
    },
    supportCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.35),
      backgroundColor: withOpacity(theme.colors.accent, 0.1),
      padding: 13,
      gap: 8,
    },
    supportTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text,
    },
    supportCopy: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textMuted,
    },
    supportActionsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    supportPrimaryButton: {
      flex: 1,
      borderRadius: 12,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
    },
    supportPrimaryText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#FFFFFF',
      textAlign: 'center',
    },
    supportSecondaryButton: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.45),
      backgroundColor: withOpacity(theme.colors.accent, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    supportSecondaryText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: theme.colors.accent,
      textAlign: 'center',
    },
    facilityCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    facilityIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
    },
    facilityTextWrap: {
      flex: 1,
      gap: 1,
    },
    facilityTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: theme.colors.text,
    },
    facilityCopy: {
      fontSize: 12.5,
      lineHeight: 17,
      color: theme.colors.textMuted,
    },
    facilityButton: {
      borderRadius: 10,
      backgroundColor: theme.colors.accent,
      paddingHorizontal: 11,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    facilityButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    linksSection: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 12,
      gap: 9,
    },
    linksLabel: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      color: theme.colors.textMuted,
    },
    linksWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    linkPill: {
      borderRadius: 12,
      borderWidth: 0,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    linkPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.text,
    },
    sourcesLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    sourcesWrap: {
      gap: 8,
    },
    sourceRow: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.border, 0.95),
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    sourceText: {
      flex: 1,
      fontSize: 12.5,
      color: theme.colors.text,
      fontWeight: '600',
      lineHeight: 17,
    },
    backToPlansButton: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
    },
    backToPlansText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
