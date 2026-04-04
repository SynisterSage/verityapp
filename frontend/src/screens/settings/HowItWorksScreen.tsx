import { useRef, useMemo, useState, useEffect } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

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
  color: string;
};

const CHAPTERS: Chapter[] = [
  { id: 'basics', title: 'Using the App', icon: 'shield-checkmark-outline', sections: SYSTEM_BASICS_CONTENT, color: '#2d6df6' },
  { id: 'privacy', title: 'Your Privacy & Data', icon: 'lock-closed-outline', sections: PRIVACY_CONTENT, color: '#10b981' },
  { id: 'faq', title: 'Common Questions', icon: 'help-circle-outline', sections: FAQ_CONTENT, color: '#f59e0b' },
  { id: 'billing', title: 'Billing & Membership', icon: 'card-outline', sections: BILLING_CONTENT, color: '#8b5cf6' },
];

type FeaturedArticle = {
  sectionId: string;
  chapterId: string;
  title: string;
  subtitle: string;
  icon: string;
};

const FEATURED_ARTICLES: FeaturedArticle[] = [
  {
    sectionId: 'overview',
    chapterId: 'basics',
    title: 'How Verity Protect works',
    subtitle: 'A quick tour of the app',
    icon: 'shield-checkmark-outline',
  },
  {
    sectionId: 'mobile-and-landline',
    chapterId: 'basics',
    title: 'Use Verity on your landline',
    subtitle: 'Protect both mobile and landline',
    icon: 'call-outline',
  },
  {
    sectionId: 'call-detail',
    chapterId: 'basics',
    title: 'Review call details',
    subtitle: 'Verify calls and take action',
    icon: 'document-text-outline',
  },
  {
    sectionId: 'profile-setup',
    chapterId: 'basics',
    title: 'Profile & call flow',
    subtitle: 'Get your setup right',
    icon: 'settings-outline',
  },
];

function SectionRow({
  section,
  chapterId,
  chapterColor,
  highlight,
}: {
  section: ResourceSection;
  chapterId: string;
  chapterColor: string;
  highlight: boolean;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const chapter = CHAPTERS.find(c => c.id === chapterId);

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
    <View
      style={[
        styles.sectionRow,
        {
          borderTopColor: theme.colors.border,
          backgroundColor: highlight ? withOpacity(chapterColor, 0.06) : 'transparent',
        },
      ]}
    >
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.sectionRowHeader, pressed && { opacity: 0.6 }]}
        android_ripple={{ color: withOpacity(theme.colors.text, 0.06) }}
      >
        <View style={styles.sectionRowLeft}>
          <Text style={[styles.sectionRowTitle, { color: theme.colors.text }]}>{section.title}</Text>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: withOpacity(chapterColor, 0.15), borderColor: withOpacity(chapterColor, 0.3) },
            ]}
          >
            <Text style={[styles.categoryBadgeText, { color: chapterColor }]}>{chapter?.title}</Text>
          </View>
        </View>
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

function ChapterCard({
  chapter,
  filteredSections,
  showAll,
}: {
  chapter: Chapter;
  filteredSections: ResourceSection[];
  showAll: boolean;
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const previewCount = 2;
  const visibleSections = expanded || showAll ? filteredSections : filteredSections.slice(0, previewCount);
  const hasMore = filteredSections.length > previewCount && !expanded && !showAll;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  if (!showAll && filteredSections.length === 0) {
    return null;
  }

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
        <View style={[styles.cardIcon, { backgroundColor: withOpacity(chapter.color, 0.12) }]}>
          <Ionicons name={chapter.icon as any} size={18} color={chapter.color} />
        </View>
        <View style={styles.cardTitleWrap}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{chapter.title}</Text>
          <Text style={[styles.cardCount, { color: theme.colors.textMuted }]}>
            {filteredSections.length} {filteredSections.length === 1 ? 'article' : 'articles'}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={15}
          color={theme.colors.textMuted}
        />
      </Pressable>

      {visibleSections.map((section) => (
        <SectionRow
          key={section.id}
          section={section}
          chapterId={chapter.id}
          chapterColor={chapter.color}
          highlight={false}
        />
      ))}

      {hasMore && (
        <Pressable
          onPress={toggle}
          style={[styles.showMoreButton, { borderTopColor: theme.colors.border }]}
        >
          <Text style={[styles.showMoreText, { color: theme.colors.accent }]}>
            Show all {filteredSections.length} articles
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function FeaturedCard({ article, onPress }: { article: FeaturedArticle; onPress: () => void }) {
  const { theme } = useTheme();
  const chapter = CHAPTERS.find(c => c.id === article.chapterId);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.featuredCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: chapter?.color,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.featuredIcon, { backgroundColor: withOpacity(chapter?.color || '#2d6df6', 0.12) }]}>
        <Ionicons name={article.icon as any} size={20} color={chapter?.color || '#2d6df6'} />
      </View>
      <View style={styles.featuredText}>
        <Text style={[styles.featuredTitle, { color: theme.colors.text }]}>{article.title}</Text>
        <Text style={[styles.featuredSubtitle, { color: theme.colors.textMuted }]}>{article.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={theme.colors.textMuted} />
    </Pressable>
  );
}

export default function HowItWorksScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const clearAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const featuredScrollAnim = useRef(new Animated.Value(0)).current;
  const fadeLeftAnim = useRef(new Animated.Value(0)).current;

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredChapters = useMemo(() => {
    if (!normalizedQuery) {
      return CHAPTERS.map(chapter => ({
        ...chapter,
        sections: chapter.sections,
      }));
    }

    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

    return CHAPTERS.map(chapter => {
      const filteredSections = chapter.sections.filter(section => {
        const haystack = [section.title, section.body, ...(section.bullets ?? [])]
          .join(' ')
          .toLowerCase();
        return tokens.every(token => haystack.includes(token));
      });
      return {
        ...chapter,
        sections: filteredSections,
      };
    });
  }, [normalizedQuery]);

  const handleFeaturedPress = (article: FeaturedArticle) => {
    const section = CHAPTERS.find(c => c.id === article.chapterId)?.sections.find(s => s.id === article.sectionId);
    if (section) {
      setSearchQuery(section.title);
    }
  };

  useEffect(() => {
    Animated.timing(clearAnim, {
      toValue: searchQuery ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [clearAnim, searchQuery]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={[]}>
      <SettingsHeader title="How It Works" />

      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 32) }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={[
            styles.searchWrap,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
            {
              opacity: scrollY.interpolate({
                inputRange: [0, 40],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
              transform: [
                {
                  translateY: scrollY.interpolate({
                    inputRange: [0, 40],
                    outputRange: [0, -8],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search articles..."
            placeholderTextColor={withOpacity(theme.colors.textMuted, 0.7)}
            style={[styles.searchInput, { color: theme.colors.text }]}
            returnKeyType="search"
            clearButtonMode="never"
            multiline={false}
          />
          {searchQuery ? (
            <Animated.View
              style={{
                opacity: clearAnim,
                transform: [
                  {
                    scale: clearAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                ],
              }}
            >
              <Pressable
                onPress={() => setSearchQuery('')}
                style={({ pressed }) => [
                  styles.searchClear,
                  pressed && { opacity: 0.6, transform: [{ scale: 0.92 }] },
                ]}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
              </Pressable>
            </Animated.View>
          ) : null}
        </Animated.View>
        {!normalizedQuery && (
          <>
            <View style={styles.sectionSpacing}>
              <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Featured</Text>
              <View style={styles.featuredScrollContainer}>
                <FlatList
                  horizontal
                  scrollEnabled={true}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.featuredContainer}
                  data={FEATURED_ARTICLES}
                  keyExtractor={(item) => item.sectionId}
                  renderItem={({ item }) => (
                    <FeaturedCard
                      article={item}
                      onPress={() => handleFeaturedPress(item)}
                    />
                  )}
                  scrollEventThrottle={16}
                  onScroll={(e) => {
                    const offsetX = e.nativeEvent.contentOffset.x;
                    Animated.timing(fadeLeftAnim, {
                      toValue: offsetX > 0 ? 1 : 0,
                      duration: 200,
                      useNativeDriver: true,
                    }).stop();
                    fadeLeftAnim.setValue(offsetX > 0 ? 1 : 0);
                  }}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.fadeLeft,
                    { opacity: fadeLeftAnim },
                  ]}
                >
                  <LinearGradient
                    colors={[theme.colors.bg, withOpacity(theme.colors.bg, 0)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                <LinearGradient
                  colors={[withOpacity(theme.colors.bg, 0), theme.colors.bg]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  pointerEvents="none"
                  style={styles.fadeRight}
                />
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.colors.textMuted, marginTop: 24 }]}>
              All Topics
            </Text>
          </>
        )}

        {normalizedQuery && (
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted, marginTop: 12 }]}>
            Results
          </Text>
        )}

        {filteredChapters.every(c => c.sections.length === 0) && normalizedQuery ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No matches</Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
              Try searching for "PIN", "data", or "billing".
            </Text>
          </View>
        ) : (
          filteredChapters.map((chapter) => (
            <ChapterCard
              key={chapter.id}
              chapter={chapter}
              filteredSections={chapter.sections}
              showAll={!!normalizedQuery}
            />
          ))
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: {
    marginTop: 12,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    height: 44,
    paddingVertical: 0,
    lineHeight: 18,
    textAlignVertical: 'center',
  },
  searchClear: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionSpacing: {
    marginVertical: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  featuredContainer: {
    gap: 12,
    paddingRight: 16,
  },
  featuredScrollContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
  },
  fadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 20,
    zIndex: 2,
  },
  fadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 20,
    zIndex: 2,
  },
  featuredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    minWidth: 280,
  },
  featuredIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featuredText: {
    flex: 1,
  },
  featuredTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  featuredSubtitle: {
    fontSize: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    marginTop: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardCount: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  sectionRowLeft: {
    flex: 1,
    gap: 6,
  },
  sectionRowTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  sectionRowBody: {
    paddingHorizontal: 14,
    paddingBottom: 12,
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
  showMoreButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
  },
});
