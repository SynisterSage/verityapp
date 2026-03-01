import { useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import SettingsHeader from '../../components/common/SettingsHeader';
import { useTheme } from '../../context/ThemeContext';
import { withOpacity } from '../../utils/color';
import {
  BILLING_CONTENT,
  FAQ_CONTENT,
  PRIVACY_CONTENT,
  ResourceSection,
  SYSTEM_BASICS_CONTENT,
} from '../../data/resourceSections';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Chapter = {
  id: string;
  title: string;
  icon: string;
  sections: ResourceSection[];
};

const CHAPTERS: Chapter[] = [
  { id: 'basics', title: 'Using the App', icon: 'shield-checkmark-outline', sections: SYSTEM_BASICS_CONTENT },
  { id: 'privacy', title: 'Your Privacy & Data', icon: 'lock-closed-outline', sections: PRIVACY_CONTENT },
  { id: 'faq', title: 'Common Questions', icon: 'help-circle-outline', sections: FAQ_CONTENT },
  { id: 'billing', title: 'Billing & Membership', icon: 'card-outline', sections: BILLING_CONTENT },
];

function SectionRow({ section }: { section: ResourceSection }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(rotateAnim, {
      toValue: open ? 0 : 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    setOpen((v) => !v);
  };

  const chevronRotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <View style={[styles.sectionRow, { borderTopColor: theme.colors.border }]}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.sectionRowHeader, pressed && { opacity: 0.6 }]}
        android_ripple={{ color: withOpacity(theme.colors.text, 0.06) }}
      >
        <Text style={[styles.sectionRowTitle, { color: theme.colors.text }]}>{section.title}</Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <Ionicons name="chevron-forward" size={15} color={theme.colors.textMuted} />
        </Animated.View>
      </Pressable>

      {open && (
        <View style={styles.sectionRowBody}>
          <Text style={[styles.bodyText, { color: theme.colors.textMuted }]}>{section.body}</Text>
          {section.bullets?.map((bullet, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bulletDot, { backgroundColor: theme.colors.accent }]} />
              <Text style={[styles.bulletText, { color: theme.colors.textMuted }]}>{bullet}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ChapterCard({ chapter }: { chapter: Chapter }) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.cardHeader, pressed && { opacity: 0.7 }]}
        android_ripple={{ color: withOpacity(theme.colors.text, 0.06) }}
      >
        <View style={[styles.cardIcon, { backgroundColor: withOpacity(theme.colors.accent, 0.12) }]}>
          <Ionicons name={chapter.icon as any} size={18} color={theme.colors.accent} />
        </View>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{chapter.title}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={15}
          color={theme.colors.textMuted}
        />
      </Pressable>

      {expanded && chapter.sections.map((section) => (
        <SectionRow key={section.id} section={section} />
      ))}
    </View>
  );
}

export default function HowItWorksScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={[]}>
      <SettingsHeader title="How It Works" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 32) }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: theme.colors.textMuted }]}>
          Tap a topic to learn how Verity Protect works.
        </Text>
        {CHAPTERS.map((chapter) => (
          <ChapterCard key={chapter.id} chapter={chapter} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  intro: {
    fontSize: 13,
    marginBottom: 14,
  },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 8,
  },
  sectionRowTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  sectionRowBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 6,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 7,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
});

