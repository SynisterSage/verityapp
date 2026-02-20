import { ScrollView, StyleSheet, View, Text } from 'react-native';
import { useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';

import SettingsHeader from '../../components/common/SettingsHeader';
import { useTheme } from '../../context/ThemeContext';
import type { RootStackParamList } from '../../navigation/types';
import {
  FAQ_CONTENT,
  PRIVACY_CONTENT,
  SYSTEM_BASICS_CONTENT,
  BILLING_CONTENT,
} from '../../data/resourceSections';
import type { ResourceSection, SupportResourceType } from '../../data/resourceSections';

export default function SupportResourceScreen() {
  const { theme } = useTheme();
  const route = useRoute<RouteProp<RootStackParamList, 'SupportResource'>>();
  const resourceType = route.params?.resource;
  const computedTitle =
    route.params?.title ??
    (resourceType === 'billing'
      ? 'Billing & Subscriptions'
      : resourceType === 'faq'
      ? 'Support FAQ'
      : 'Resources');
  const sections = useMemo<ResourceSection[]>(() => {
    switch (resourceType) {
      case 'system-basics':
        return SYSTEM_BASICS_CONTENT;
      case 'privacy':
        return PRIVACY_CONTENT;
      case 'faq':
        return FAQ_CONTENT;
      case 'billing':
        return BILLING_CONTENT;
      default:
        return [];
    }
  }, [resourceType]);
  const introHeading =
    resourceType === 'privacy'
      ? 'Privacy essentials'
      : resourceType === 'faq'
      ? 'Support FAQ'
      : resourceType === 'billing'
      ? 'Billing & Subscriptions'
      : 'Guided tour';
  const introBody =
    resourceType === 'privacy'
      ? 'Everything here explains how we protect your data and keep you in control.'
      : resourceType === 'faq'
      ? 'Browse common questions and answers about tickets, automation, and exports.'
      : resourceType === 'billing'
      ? 'App Store or Play Store handles your subscription; we can help with receipts or context when you contact the store.'
      : 'Everything here explains how each feature works and where to tap for help.';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={[]}>
      <SettingsHeader
        title={computedTitle}
        popupBackIcon
        subtitle={
          resourceType === 'privacy'
            ? 'Ownership and Transparency'
            : resourceType === 'faq'
            ? 'Answers to common questions'
            : resourceType === 'billing'
            ? 'App Store billing & refunds'
            : 'Learn how Verity Protect works'
        }
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introBlock}>
          <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>{introHeading}</Text>
          <Text style={[styles.sectionBody, { color: theme.colors.textMuted }]}>{introBody}</Text>
        </View>
        {sections.map((section: ResourceSection, index: number) => (
          <View key={section.id} style={[styles.sectionBlock, index === 0 ? styles.firstSection : null]}>
            <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>{section.title}</Text>
            <Text style={[styles.sectionBody, { color: theme.colors.textMuted }]}>{section.body}</Text>
            {section.bullets?.map((bullet: string) => (
              <View key={bullet} style={styles.bulletRow}>
                <View style={[styles.bulletDot, { backgroundColor: theme.colors.accent }]} />
                <Text style={[styles.bulletText, { color: theme.colors.textMuted }]}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 32,
  },
  introBlock: {
    marginBottom: 18,
  },
  sectionBlock: {
    marginBottom: 20,
  },
  firstSection: {
    marginTop: 8,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  gridCard: {
    width: '48%',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  faqContainer: {
    marginTop: 24,
  },
  faqRow: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  faqDetail: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
});
