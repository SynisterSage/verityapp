import { useState } from 'react';
import {
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';

type Release = {
  version: string;
  label: string;
  date: string;
  highlights: string[];
};

const RELEASES: Release[] = [
  {
    version: '1.0.3',
    label: 'Latest Release',
    date: 'March 2026',
    highlights: [
      "Hey, it's Lex from Verity. Quick but important update following yesterday's 1.0.2 release.",
      "What we fixed: a navigation issue that blocked some people from getting back to plans, and text scaling that broke the app for larger display settings. If your loved one's phone looked broken, this one's for them.",
      'What we improved: tighter first-time welcome, stronger sign-in flow, and smoother onboarding with the rough edges sanded down.',
      "We're watching closely and moving fast. More soon. — Lex & the Verity team",
    ],
  },
  {
    version: '1.0.1',
    label: 'Previous Release',
    date: 'March 2026',
    highlights: [
      "Hey, it's Lex from Verity. 1.0.1 focused on stability right after launch.",
      'Fixes: addressed early crashes, login edge cases, and tightened fraud screening reliability.',
      'Accessibility: added larger-text support in key surfaces so high-scale devices stay readable.',
      'Quality-of-life: smoother invite/join steps for family circles and clearer trial messaging.',
      'Thanks for the fast feedback — keep it coming. — Lex & the Verity team',
    ],
  },
  {
    version: '1.0.0',
    label: 'Initial Release',
    date: 'March 2026',
    highlights: [
      "Hey, it's Lex from Verity. 1.0.0 is our first public release.",
      'What you get: the protected Verity line, real-time fraud and spam screening, trusted contacts that always get through, and transcripts/recordings for reviewed calls.',
      'Control: set safe phrases, block with one tap, and tune rules for when you are busy.',
      'Sharing: invite family to your circle so they can help monitor and keep an eye on activity.',
      'Billing: App Store subscription with easy cancellation anytime.',
      'We are just getting started — thanks for being early with us. — Lex & the Verity team',
    ],
  },
];

export default function WhatsNewScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const styles = makeStyles(theme);
  const [expandedByVersion, setExpandedByVersion] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        RELEASES.map((release, index) => [release.version, index === 0])
      ) as Record<string, boolean>
  );

  const containerPaddingTop = Math.max(16, insets.top + 4);
  const contentPaddingBottom = Math.max(insets.bottom, 32);

  return (
    <SafeAreaView style={[styles.container, { paddingTop: containerPaddingTop }]} edges={[]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} style={styles.backIcon} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>What's New</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroBlock}>
          <Text style={styles.heroTitle}>Verity Protect</Text>
          <View style={styles.heroMeta}>
            <Ionicons name="sparkles-outline" size={13} color={theme.colors.textMuted} />
            <Text style={styles.heroMetaText}>Release notes and updates</Text>
          </View>
        </View>

        {RELEASES.map((release) => (
          <View key={release.version} style={styles.section}>
            <Pressable
              style={({ pressed }) => [styles.sectionHeaderPressable, pressed && styles.sectionHeaderPressed]}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setExpandedByVersion((prev) => ({
                  ...prev,
                  [release.version]: !prev[release.version],
                }));
              }}
              accessibilityRole="button"
              accessibilityLabel={`Toggle release notes for version ${release.version}`}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionLabel}>{release.label}</Text>
                  <Text style={styles.sectionVersion}>{release.version}</Text>
                </View>
                <View style={styles.sectionHeaderRight}>
                  <Text style={styles.sectionDate}>{release.date}</Text>
                  <Ionicons
                    name={expandedByVersion[release.version] ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={theme.colors.textMuted}
                  />
                </View>
              </View>
            </Pressable>
            {expandedByVersion[release.version] ? (
              <View style={styles.card}>
                {release.highlights.map((item, i) => (
                  <View key={i} style={[styles.bulletRow, i > 0 && styles.bulletRowBorder]}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: ReturnType<typeof import('../../context/ThemeContext').useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg,
    },
    header: {
      paddingHorizontal: 24,
      paddingBottom: 22,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.1),
    },
    backIcon: {
      transform: [{ rotate: '-90deg' }],
    },
    headerContent: {
      flex: 1,
    },
    headerTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    content: {
      paddingHorizontal: 24,
      paddingTop: 8,
    },
    heroBlock: {
      paddingTop: 4,
      paddingBottom: 24,
    },
    heroTitle: {
      color: theme.colors.text,
      fontSize: 26,
      fontWeight: '700',
    },
    heroMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
      gap: 6,
    },
    heroMetaText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      letterSpacing: 0.1,
    },
    section: {
      marginBottom: 28,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    sectionHeaderPressable: {
      marginBottom: 14,
    },
    sectionHeaderPressed: {
      opacity: 0.72,
    },
    sectionHeaderLeft: {
      gap: 3,
      flex: 1,
      minWidth: 0,
    },
    sectionHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    sectionVersion: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    sectionDate: {
      color: theme.colors.textMuted,
      fontSize: 11,
      letterSpacing: 0.1,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 32,
      paddingVertical: 8,
      paddingHorizontal: 24,
      borderWidth: 1,
      borderColor: withOpacity(theme.colors.text, 0.08),
      overflow: 'hidden',
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 14,
      gap: 12,
    },
    bulletRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: withOpacity(theme.colors.text, 0.08),
    },
    bulletDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.accent,
      marginTop: 7,
      flexShrink: 0,
    },
    bulletText: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 21,
      letterSpacing: 0.1,
    },
  });
