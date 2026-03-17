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
import { useAuth } from '../../context/AuthContext';
import type { AppTheme } from '../../theme/tokens';
import { withOpacity } from '../../utils/color';
import { logEvent } from '../../services/sentry';

const riskStats = [
  {
    value: '$12B+ lost to fraud in 2024',
    source: 'SOURCE: FTC',
  },
  {
    value: 'Older adults are the #1 target',
    source: 'SOURCE: FBI',
  },
] as const;

const scenarioCases = [
  {
    title: 'Your mom gets a call about her computer.',
    before: 'Unknown caller claims your computer has a virus.',
    after: 'Verity screens the call. Your family never hears it.',
  },
  {
    title: 'Someone says her account is locked.',
    before: 'Caller says your account is locked, act now.',
    after: 'Flagged as high risk. You get an alert. Call blocked.',
  },
  {
    title: 'A stranger claims to be family.',
    before: 'Someone claims to be a grandchild in trouble.',
    after: "PIN required. Caller can't provide it. Sent to voicemail.",
  },
] as const;

const useCases = [
  {
    icon: 'person-outline' as const,
    title: 'Older adults',
    copy: 'Uses their existing phone. Nothing new to learn.',
  },
  {
    icon: 'radio-outline' as const,
    title: 'Remote caregivers',
    copy: 'Stay informed from anywhere. Real-time alerts.',
  },
  {
    icon: 'business-outline' as const,
    title: 'Facility partners',
    copy: 'Zero setup for your team. Families handle everything.',
  },
  {
    icon: 'phone-portrait-outline' as const,
    title: 'Any device',
    copy: 'Family sets it up in the iOS app. Loved ones can keep mobile or landline phones.',
  },
] as const;

const comparisonRows = [
  'Shared family visibility',
  'Call transcripts',
  'Landline support',
  'Advanced screening controls',
] as const;

const caregiverPoints = [
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Less worry',
    copy: 'Stop wondering if they answered a scam call.',
  },
  {
    icon: 'flash-outline' as const,
    title: 'Faster review',
    copy: 'Transcripts and risk scores delivered instantly.',
  },
  {
    icon: 'ellipse-outline' as const,
    title: 'Their independence',
    copy: 'They keep their phone. You keep your peace of mind.',
  },
] as const;

const topLinks = [
  { label: 'verityprotect.com', url: 'https://www.verityprotect.com/' },
  { label: 'Instagram', url: 'https://instagram.com/VerityProtect' },
  { label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61586541604181' },
  { label: 'X', url: 'https://x.com/VerityProtect' },
] as const;

const bottomLinks = [
  { label: 'Terms', url: 'https://www.verityprotect.com/terms' },
  { label: 'Privacy', url: 'https://www.verityprotect.com/privacy' },
  {
    label: 'FTC Source',
    url: 'https://www.ftc.gov/news-events/news/press-releases/2025/03/new-ftc-data-show-big-jump-reported-losses-fraud-125-billion-2024',
  },
  { label: 'FBI Source', url: 'https://www.ic3.gov/Media/PDF/AnnualReport/2024_IC3Report.pdf' },
] as const;

export default function WhyChooseVerityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'WhyChooseVerity'>>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
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
          <Ionicons name="chevron-down" size={17} color={theme.colors.text} style={styles.backIcon} />
        </Pressable>
        <Text style={styles.headerTitle}>Why Choose Verity</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + theme.spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <View style={styles.heroIconShell}>
            <Ionicons name="shield-checkmark-outline" size={32} color={theme.colors.accent} />
          </View>
          <Text style={styles.heroTitle}>A calm first line{`\n`}of defense.</Text>
          <Text style={styles.heroCopy}>
            Verity sits quietly between the outside world and the people you love. No disruption. No
            confusion. Just protection.
          </Text>

          <View style={styles.statsGrid}>
            {riskStats.map((stat) => (
              <View key={stat.value} style={styles.statCard}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statSource}>{stat.source}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>What changes</Text>
          <View style={styles.stack16}>
            {scenarioCases.map((scenario) => (
              <View key={scenario.title} style={styles.scenarioCard}>
                <Text style={styles.scenarioTitle}>{scenario.title}</Text>

                <View style={styles.scenarioRowsWrap}>
                  <View style={styles.beforeRow}>
                    <View style={[styles.rowMarker, styles.beforeMarker]} />
                    <View style={styles.rowContentWrap}>
                      <View style={styles.rowTagWrap}>
                        <View style={styles.beforeDot} />
                        <Text style={styles.beforeTag}>Before</Text>
                      </View>
                      <Text style={styles.beforeCopy}>{scenario.before}</Text>
                    </View>
                  </View>

                  <View style={styles.afterRow}>
                    <View style={[styles.rowMarker, styles.afterMarker]} />
                    <View style={styles.rowContentWrap}>
                      <View style={styles.rowTagWrap}>
                        <View style={styles.afterDot} />
                        <Text style={styles.afterTag}>After</Text>
                      </View>
                      <Text style={styles.afterCopy}>{scenario.after}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Who it's for</Text>
          <View style={styles.audienceGrid}>
            {useCases.map((item) => (
              <View key={item.title} style={styles.audienceCard}>
                <View style={styles.audienceIconWrap}>
                  <Ionicons name={item.icon} size={14} color={theme.colors.accent} />
                </View>
                <Text style={styles.audienceTitle}>{item.title}</Text>
                <Text style={styles.audienceCopy}>{item.copy}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>How we're different</Text>
          <View style={styles.comparisonCard}>
            <View style={styles.comparisonHeaderRow}>
              <Text style={[styles.comparisonHeaderCell, styles.comparisonFeatureCell]}>Feature</Text>
              <Text style={styles.comparisonHeaderCell}>Verity</Text>
              <Text style={styles.comparisonHeaderCell}>Others</Text>
            </View>

            {comparisonRows.map((feature) => (
              <View key={feature} style={styles.comparisonRow}>
                <Text style={[styles.comparisonFeatureText, styles.comparisonFeatureCell]}>{feature}</Text>
                <Ionicons name="checkmark" size={16} color={theme.colors.accent} />
                <Ionicons name="close" size={16} color={withOpacity(theme.colors.danger, 0.75)} />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>For caregivers</Text>
          <View style={styles.stack24}>
            {caregiverPoints.map((point) => (
              <View key={point.title} style={styles.caregiverRow}>
                <View style={styles.caregiverIconWrap}>
                  <Ionicons name={point.icon} size={16} color={theme.colors.accent} />
                </View>
                <View style={styles.caregiverTextWrap}>
                  <Text style={styles.caregiverTitle}>{point.title}</Text>
                  <Text style={styles.caregiverCopy}>{point.copy}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Need help?</Text>
          <View style={styles.helpCard}>
            <Pressable
              style={styles.helpRow}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => null);
                if (session) {
                  navigation.navigate('SupportPortal');
                  return;
                }
                void openExternalLink('mailto:support@verityprotect.com', 'Support Email');
              }}
            >
              <Text style={styles.helpRowText}>Open Support Portal</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </Pressable>

            <View style={styles.helpDivider} />

            <Pressable
              style={styles.helpRow}
              onPress={() => {
                void openExternalLink(
                  'mailto:support@verityprotect.com?subject=Facility%20Partnership%20Inquiry',
                  'Facility Partnership Email'
                );
              }}
            >
              <Text style={styles.helpRowText}>Partner with us</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.linkRowsWrap}>
          <View style={styles.dotLinkRow}>
            {topLinks.map((link, index) => (
              <View key={link.label} style={styles.inlineLinkWrap}>
                {index > 0 ? <Text style={styles.inlineDot}>·</Text> : null}
                <Pressable
                  onPress={() => {
                    void openExternalLink(link.url, link.label);
                  }}
                >
                  <Text style={styles.inlineLink}>{link.label}</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <View style={styles.dotLinkRow}>
            {bottomLinks.map((link, index) => (
              <View key={link.label} style={styles.inlineLinkWrap}>
                {index > 0 ? <Text style={styles.inlineDot}>·</Text> : null}
                <Pressable
                  onPress={() => {
                    void openExternalLink(link.url, link.label);
                  }}
                >
                  <Text style={styles.inlineLink}>{link.label}</Text>
                </Pressable>
              </View>
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
          <Ionicons name="arrow-forward" size={16} color={theme.colors.surface} />
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
      backgroundColor: theme.colors.bg,
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
      marginTop: 1,
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
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.xs,
      gap: theme.spacing.xl,
    },
    heroSection: {
      paddingTop: theme.spacing.xxl + theme.spacing.xs,
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    heroIconShell: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: withOpacity(theme.colors.accent, 0.05),
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.accent, 0.16),
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      textAlign: 'center',
      fontSize: theme.typography.title.size,
      lineHeight: theme.typography.title.lineHeight,
      fontWeight: '700',
      color: theme.colors.text,
      letterSpacing: -0.4,
    },
    heroCopy: {
      maxWidth: 320,
      textAlign: 'center',
      fontSize: theme.typography.body.size,
      lineHeight: theme.typography.body.lineHeight,
      color: theme.colors.textMuted,
      paddingHorizontal: theme.spacing.xs,
    },
    statsGrid: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.md,
      marginTop: theme.spacing.md,
    },
    statCard: {
      flexBasis: '47.5%',
      flexGrow: 1,
      borderRadius: theme.radii.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      minHeight: 118,
      justifyContent: 'space-between',
    },
    statValue: {
      fontSize: theme.typography.bodyStrong.size,
      lineHeight: theme.typography.bodyStrong.lineHeight,
      fontWeight: '700',
      color: theme.colors.text,
    },
    statSource: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '700',
      color: theme.colors.textDim,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    sectionWrap: {
      gap: theme.spacing.md,
    },
    sectionTitle: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 2,
      color: theme.colors.textDim,
    },
    stack16: {
      gap: theme.spacing.md,
    },
    scenarioCard: {
      borderRadius: theme.radii.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    scenarioTitle: {
      fontSize: theme.typography.bodyStrong.size,
      lineHeight: theme.typography.bodyStrong.lineHeight,
      fontWeight: '700',
      color: theme.colors.text,
    },
    scenarioRowsWrap: {
      gap: 12,
    },
    beforeRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 10,
    },
    afterRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 10,
    },
    rowMarker: {
      width: 3,
      borderRadius: 2,
    },
    beforeMarker: {
      backgroundColor: withOpacity(theme.colors.danger, 0.9),
    },
    afterMarker: {
      backgroundColor: withOpacity(theme.colors.success, 0.9),
    },
    rowContentWrap: {
      flex: 1,
      gap: 4,
      paddingBottom: 1,
    },
    rowTagWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    beforeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: withOpacity(theme.colors.danger, 0.95),
    },
    afterDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: withOpacity(theme.colors.success, 0.95),
    },
    beforeTag: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      color: withOpacity(theme.colors.danger, 0.9),
    },
    afterTag: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      color: withOpacity(theme.colors.success, 0.9),
    },
    beforeCopy: {
      fontSize: theme.typography.caption.size,
      lineHeight: theme.typography.caption.lineHeight,
      color: theme.colors.textMuted,
    },
    afterCopy: {
      fontSize: theme.typography.caption.size,
      lineHeight: theme.typography.caption.lineHeight,
      color: theme.colors.text,
      fontWeight: '500',
    },
    audienceGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.md,
    },
    audienceCard: {
      flexBasis: '47.5%',
      flexGrow: 1,
      borderRadius: theme.radii.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      minHeight: 148,
    },
    audienceIconWrap: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withOpacity(theme.colors.accent, 0.14),
    },
    audienceTitle: {
      fontSize: theme.typography.bodyStrong.size,
      lineHeight: 20,
      fontWeight: '700',
      color: theme.colors.text,
    },
    audienceCopy: {
      fontSize: 12,
      lineHeight: 17,
      color: theme.colors.textMuted,
    },
    comparisonCard: {
      borderRadius: theme.radii.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    comparisonHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: 10,
      paddingHorizontal: theme.spacing.md,
      gap: 8,
    },
    comparisonHeaderCell: {
      width: 56,
      textAlign: 'center',
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      color: theme.colors.textDim,
    },
    comparisonFeatureCell: {
      flex: 1,
      width: 'auto',
      textAlign: 'left',
    },
    comparisonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      paddingVertical: 13,
      paddingHorizontal: theme.spacing.md,
      gap: 8,
    },
    comparisonFeatureText: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.text,
    },
    stack24: {
      gap: theme.spacing.xl,
    },
    caregiverRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.md,
    },
    caregiverIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    caregiverTextWrap: {
      flex: 1,
      gap: 3,
    },
    caregiverTitle: {
      fontSize: theme.typography.bodyStrong.size,
      lineHeight: theme.typography.bodyStrong.lineHeight,
      fontWeight: '700',
      color: theme.colors.text,
    },
    caregiverCopy: {
      fontSize: theme.typography.caption.size,
      lineHeight: theme.typography.caption.lineHeight,
      color: theme.colors.textMuted,
    },
    helpCard: {
      borderRadius: theme.radii.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    helpRow: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 15,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    helpRowText: {
      fontSize: theme.typography.bodyStrong.size,
      lineHeight: theme.typography.bodyStrong.lineHeight,
      color: theme.colors.text,
      fontWeight: '600',
    },
    helpDivider: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    linkRowsWrap: {
      gap: 8,
      paddingTop: 4,
      alignItems: 'center',
    },
    dotLinkRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      rowGap: 4,
    },
    inlineLinkWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 2,
    },
    inlineDot: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.textDim,
      marginHorizontal: 5,
    },
    inlineLink: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.textMuted,
    },
    backToPlansButton: {
      height: 60,
      borderRadius: 30,
      backgroundColor: theme.colors.accent,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 4,
    },
    backToPlansText: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '700',
      color: theme.colors.surface,
    },
  });
