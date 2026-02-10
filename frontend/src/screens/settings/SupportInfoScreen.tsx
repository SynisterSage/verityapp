import { ScrollView, StyleSheet, Text, View, Pressable, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';

import { useTheme } from '../../context/ThemeContext';
import SettingsHeader from '../../components/common/SettingsHeader';
import { navigateToSupportPortal, navigateToSupportResource } from '../../navigation/rootNavigator';
import { withOpacity } from '../../utils/color';
import { SUPPORT_PORTAL_RESOURCES, SupportResourceEntry } from '../../data/supportResources';

export default function SupportInfoScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollPadding = Math.max(insets.bottom, 16);
  const handleSupportPress = useCallback(() => {
    navigateToSupportPortal();
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={[]}>
      <SettingsHeader title="Support" subtitle="Chat with our safety team" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: scrollPadding }]}
      >
        <View style={[styles.resourcesSection, { marginBottom: 24 }]}>
          <Text
            style={[
              styles.sectionHeader,
              { color: theme.colors.textMuted, fontWeight: '600', marginBottom: 10 },
            ]}
          >
            RESOURCES
          </Text>
          <View style={styles.resourcesGrid}>
            {SUPPORT_PORTAL_RESOURCES.map((resource: SupportResourceEntry) => (
              <Pressable
                key={resource.id}
                style={({ pressed }) => [
                  styles.resourceTile,
                  {
                    backgroundColor: pressed
                      ? withOpacity(theme.colors.surfaceAlt, 0.9)
                      : theme.colors.surfaceAlt,
                  },
                ]}
                onPress={() =>
                  navigateToSupportResource({ resource: resource.resource, title: resource.title })
                }
              >
                <Ionicons name={resource.icon as any} size={18} color={theme.colors.accent} style={styles.resourceIcon} />
                <Text style={[styles.resourceLabel, { color: theme.colors.text }]}>{resource.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View
          style={[
            styles.hero,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={[styles.heroIcon, { backgroundColor: withOpacity(theme.colors.accent, 0.15) }]}>
            <Ionicons name="help-circle-outline" size={24} color={theme.colors.accent} />
          </View>
          <View style={styles.heroText}>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Need support</Text>
            <Text style={[styles.heroSubtitle, { color: theme.colors.textMuted }]}>
              Open the live chat to send us a message. Answers usually arrive in minutes.
            </Text>
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Support portal</Text>
          <Text style={[styles.sectionBody, { color: theme.colors.textMuted }]}>
            We log every message so you have a timeline of your conversation. Tap below to jump into the portal.
          </Text>
          <Pressable
            onPress={handleSupportPress}
            style={({ pressed }) => [
              styles.chatButton,
              { backgroundColor: pressed ? withOpacity(theme.colors.accent, 0.85) : theme.colors.accent },
            ]}
          >
            <Text style={styles.chatButtonText}>Open support chat</Text>
          </Pressable>
        </View>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Other ways to reach us</Text>
          <Pressable style={styles.detailRow} onPress={() => Linking.openURL('mailto:support@verityprotect.com')}>
            <Ionicons name="mail-outline" size={20} color={theme.colors.textMuted} />
            <Text style={[styles.detailValue, { color: theme.colors.text }]}>support@verityprotect.com</Text>
          </Pressable>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={20} color={theme.colors.textMuted} />
            <Text style={[styles.detailValue, { color: theme.colors.textMuted }]}>Available 7am–10pm PT</Text>
          </View>
        </View>
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
    paddingBottom: 0,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    padding: 20,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: -18,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 14,
    marginTop: 4,
    lineHeight: 20,
  },
  card: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  chatButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
  },
  chatButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  detailValue: {
    marginLeft: 8,
    fontSize: 14,
  },
  resourcesSection: {
    marginBottom: 16,
    
  },
  resourcesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  resourceTile: {
    width: '48%',
    borderRadius: 18,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  resourceIcon: {
    marginRight: 8,
  },
  resourceLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
