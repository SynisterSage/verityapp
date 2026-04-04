import {
  StyleSheet,
  Switch,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  TextInput,
  Animated,
} from 'react-native';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import DashboardHeader from '../../components/common/DashboardHeader';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { withOpacity } from '../../utils/color';
import type { RouteProp } from '@react-navigation/native';
import type { SettingsStackParamList } from '../../navigation/types';
import { useSupportContext } from '../../context/SupportContext';
import { navigateToSupportPortal } from '../../navigation/rootNavigator';
type SettingsRowItem = {
  label: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  destructive?: boolean;
};

type SettingsSearchItem = {
  label: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: keyof SettingsStackParamList;
  section: 'Account' | 'Safety intelligence' | 'General' | 'Privacy';
  keywords?: string[];
};

export default function SettingsScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: RouteProp<SettingsStackParamList, 'Settings'>;
}) {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { canManageProfile } = useProfile();
  const { theme, mode, setMode, isUsingSystemTheme } = useTheme();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { unreadAgentCount } = useSupportContext();
  const scrollY = useRef(new Animated.Value(0)).current;
  const clearAnim = useRef(new Animated.Value(0)).current;

  const accountRows: SettingsRowItem[] = useMemo(() => {
    const rows: SettingsRowItem[] = [];
    rows.push({
      label: 'Account',
      subtitle: canManageProfile ? 'Profile & safety options' : 'View profile & safety',
      icon: 'person-outline',
      onPress: () => navigation.navigate('Account'),
    });
    if (canManageProfile) {
      rows.push({
        label: 'My Circle',
        subtitle: 'Family caretakers & guests',
        icon: 'people-outline',
        onPress: () => navigation.navigate('Members'),
      });
    }
    rows.push({
      label: 'Notifications',
      subtitle: 'Alerts & daily reports',
      icon: 'notifications-outline',
      onPress: () => navigation.navigate('Notifications'),
    });
    rows.push({
      label: 'Membership & Billing',
      subtitle: 'Plan, restore, and App Store billing',
      icon: 'card-outline',
      onPress: () => navigation.navigate('MembershipBilling'),
    });
    if (canManageProfile) {
      rows.push({
        label: 'Security',
        subtitle: 'Sign-in & safety PIN',
        icon: 'shield-checkmark-outline',
        onPress: () => navigation.navigate('Security'),
      });
    }
    return rows;
  }, [canManageProfile, navigation]);

  const safetyRows: SettingsRowItem[] = useMemo(() => {
    const rows: SettingsRowItem[] = [
      {
        label: 'Safe Phrases',
        subtitle: 'Approved conversation topics',
        icon: 'chatbubble-ellipses-outline',
        onPress: () => navigation.navigate('SafePhrases'),
      },
      {
        label: 'Doctor Lookup',
        subtitle: 'Recognize care team numbers',
        icon: 'medkit-outline',
        onPress: () => navigation.navigate('SafetyIntelligence'),
      },
      {
        label: 'Trusted Contacts',
        subtitle: 'Bypass the screening PIN',
        icon: 'people-outline',
        onPress: () => navigation.navigate('TrustedContacts'),
      },
      {
        label: 'Blocked Numbers',
        subtitle: 'Automatic spam rejection',
        icon: 'ban-outline',
        onPress: () => navigation.navigate('Blocklist'),
      },
    ];
    if (canManageProfile) {
      rows.push({
        label: 'Automation',
        subtitle: 'Verity smart screening rules',
        icon: 'flash-outline',
        onPress: () => navigation.navigate('Automation'),
      });
    }
    return rows;
  }, [canManageProfile, navigation]);

  const privacyRows: SettingsRowItem[] = useMemo(
    () => [
      {
        label: 'Data & Privacy',
        subtitle: 'Your information, protected',
        icon: 'lock-closed-outline',
        onPress: () => navigation.navigate('DataPrivacy'),
      },
    ],
    [navigation]
  );

  useEffect(() => {
    if (!route.params?.initialScreen) {
      return;
    }
    const { initialScreen } = route.params;
    navigation.setParams({ initialScreen: undefined });
    navigation.navigate(initialScreen);
  }, [route.params?.initialScreen, navigation]);

  const bottomGap = Math.max(insets.bottom, 0);

  const handleLogout = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const createRowHandler = useCallback(
    (row: SettingsRowItem) => {
      return () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
        row.onPress?.();
      };
    },
    []
  );

  const handleSupportPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    navigateToSupportPortal();
  }, []);

  const sections = useMemo(
    () => [
      { title: 'Account', rows: accountRows },
      { title: 'Safety intelligence', rows: safetyRows },
    ],
    [accountRows, safetyRows]
  );
  const privacySection = useMemo(
    () => ({ title: 'Privacy', rows: privacyRows }),
    [privacyRows]
  );

  const isDarkMode = mode === 'dark';
  const toggleThemeMode = useCallback(() => {
    setMode(isDarkMode ? 'light' : 'dark');
  }, [isDarkMode, setMode]);

  const signOutRow = useMemo<SettingsRowItem>(
    () => ({
      label: 'Sign out',
      subtitle: 'Log out of this device',
      icon: 'log-out-outline',
      onPress: handleLogout,
      destructive: true,
    }),
    [handleLogout]
  );
  const howItWorksRow = useMemo<SettingsRowItem>(
    () => ({
      label: 'How It Works',
      subtitle: 'Guides and docs for Verity Protect',
      icon: 'book-outline',
      onPress: () => navigation.navigate('HowItWorks'),
    }),
    [navigation]
  );
  const supportRow = useMemo<SettingsRowItem>(
    () => ({
      label: 'Support',
      subtitle: 'Contact the Verity Protect team',
      icon: 'help-circle-outline',
      onPress: () => navigation.navigate('SupportInfo'),
    }),
    [navigation]
  );
  const appearanceRow = useMemo<SettingsRowItem>(
    () => ({
      label: 'Theme',
      subtitle: isUsingSystemTheme
        ? `Following iPhone (${isDarkMode ? 'Dark' : 'Light'})`
        : `Manual ${isDarkMode ? 'Dark' : 'Light'} mode`,
      icon: 'moon-outline',
      onPress: toggleThemeMode,
    }),
    [isDarkMode, isUsingSystemTheme, toggleThemeMode]
  );
  const systemThemeRow = useMemo<SettingsRowItem>(
    () => ({
      label: 'Use iPhone Theme',
      subtitle: 'Automatically follow your phone appearance',
      icon: 'phone-portrait-outline',
      onPress: () => setMode('system'),
    }),
    [setMode]
  );
  const signOutHandler = createRowHandler(signOutRow);

  const searchIndex = useMemo<SettingsSearchItem[]>(() => {
    const rows: SettingsSearchItem[] = [
      {
        label: 'Account',
        subtitle: 'Profile & safety options',
        icon: 'person-outline',
        route: 'Account',
        section: 'Account',
        keywords: ['profile', 'phone', 'email', 'name', 'plan'],
      },
      {
        label: 'Notifications',
        subtitle: 'Alerts & daily reports',
        icon: 'notifications-outline',
        route: 'Notifications',
        section: 'Account',
        keywords: [
          'alerts',
          'push',
          'email',
          'weekly report',
          'pin reset emails',
          'support replies',
          'circle activity',
          'trusted activity',
          'call screening',
        ],
      },
      {
        label: 'Membership & Billing',
        subtitle: 'Plan, restore, and App Store billing',
        icon: 'card-outline',
        route: 'MembershipBilling',
        section: 'Account',
        keywords: ['plan', 'billing', 'restore', 'subscription', 'membership'],
      },
      {
        label: 'Safe Phrases',
        subtitle: 'Approved conversation topics',
        icon: 'chatbubble-ellipses-outline',
        route: 'SafePhrases',
        section: 'Safety intelligence',
        keywords: ['safe phrase', 'phrases', 'conversation'],
      },
      {
        label: 'Doctor Lookup',
        subtitle: 'Recognize care team numbers',
        icon: 'medkit-outline',
        route: 'SafetyIntelligence',
        section: 'Safety intelligence',
        keywords: ['doctor', 'care team', 'medical'],
      },
      {
        label: 'Trusted Contacts',
        subtitle: 'Bypass the screening PIN',
        icon: 'people-outline',
        route: 'TrustedContacts',
        section: 'Safety intelligence',
        keywords: ['trusted', 'contacts', 'pin'],
      },
      {
        label: 'Blocked Numbers',
        subtitle: 'Automatic spam rejection',
        icon: 'ban-outline',
        route: 'Blocklist',
        section: 'Safety intelligence',
        keywords: ['block', 'blocked', 'spam'],
      },
      {
        label: 'Theme',
        subtitle: 'Light / Dark appearance',
        icon: 'moon-outline',
        route: 'Settings',
        section: 'General',
        keywords: ['theme', 'dark mode', 'light mode', 'appearance'],
      },
      {
        label: 'Use iPhone Theme',
        subtitle: 'Automatically follow your phone appearance',
        icon: 'phone-portrait-outline',
        route: 'Settings',
        section: 'General',
        keywords: ['system theme', 'automatic', 'iphone'],
      },
      {
        label: 'How It Works',
        subtitle: 'Guides and docs for Verity Protect',
        icon: 'book-outline',
        route: 'HowItWorks',
        section: 'General',
        keywords: ['guide', 'docs', 'help'],
      },
      {
        label: 'Support',
        subtitle: 'Contact the Verity Protect team',
        icon: 'help-circle-outline',
        route: 'SupportInfo',
        section: 'General',
        keywords: ['support', 'help', 'contact'],
      },
      {
        label: 'Data & Privacy',
        subtitle: 'Your information, protected',
        icon: 'lock-closed-outline',
        route: 'DataPrivacy',
        section: 'Privacy',
        keywords: ['privacy', 'data', 'export', 'delete'],
      },
    ];

    if (canManageProfile) {
      rows.splice(1, 0, {
        label: 'My Circle',
        subtitle: 'Family caretakers & guests',
        icon: 'people-outline',
        route: 'Members',
        section: 'Account',
        keywords: ['caretaker', 'family', 'invite', 'member', 'guest'],
      });
      rows.push({
        label: 'Security',
        subtitle: 'Sign-in & safety PIN',
        icon: 'shield-checkmark-outline',
        route: 'Security',
        section: 'Account',
        keywords: ['password', 'pin', 'passcode', 'reset', 'sign-in', 'face id', 'touch id'],
      });
      rows.push({
        label: 'Automation',
        subtitle: 'Verity smart screening rules',
        icon: 'flash-outline',
        route: 'Automation',
        section: 'Safety intelligence',
        keywords: ['automation', 'rules', 'screening'],
      });
    }

    return rows;
  }, [canManageProfile]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    return searchIndex.filter((item) => {
      const haystack = [
        item.label,
        item.subtitle,
        ...(item.keywords ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [normalizedQuery, searchIndex]);

  useEffect(() => {
    Animated.timing(clearAnim, {
      toValue: searchQuery ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [clearAnim, searchQuery]);

  const searchResultRows = useMemo<SettingsRowItem[]>(
    () =>
      searchResults.map((item) => ({
        label: item.label,
        subtitle: item.subtitle ? `${item.section} · ${item.subtitle}` : item.section,
        icon: item.icon,
        onPress:
          item.route === 'Settings'
            ? item.label === 'Theme'
              ? toggleThemeMode
              : item.label === 'Use iPhone Theme'
                ? () => setMode('system')
                : undefined
            : () => navigation.navigate(item.route),
      })),
    [navigation, searchResults, setMode, toggleThemeMode]
  );

  const renderSection = (section: { title: string; rows: SettingsRowItem[] }) => (
    <View key={section.title} style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{section.title}</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        {section.rows.map((row, index) => (
          <View key={row.label} style={styles.rowWrapper}>
            <SettingRow
              item={row}
              isLast={index === section.rows.length - 1}
              onPress={createRowHandler(row)}
            />
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          paddingTop: Math.max(28, insets.top + 12),
          paddingBottom: Math.max(0, insets.bottom + 0),
          backgroundColor: theme.colors.bg,
        },
      ]}
      edges={[]}
    >
      <DashboardHeader
        title="Settings"
        subtitle="Manage your preferences"
        align="left"
        supportAction={{
          onPress: handleSupportPress,
          unreadCount: unreadAgentCount,
        }}
      />
      <View style={styles.bodyWrap}>
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomGap + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: true,
          })}
        >
          <Animated.View
            style={[
              styles.searchWrap,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
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
              placeholder="Search settings"
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
          {normalizedQuery ? (
            <>
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Results</Text>
                <View
                  style={[
                    styles.card,
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                  ]}
                >
                  {searchResultRows.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No matches</Text>
                      <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>
                        Try searching for “PIN”, “notifications”, or “billing”.
                      </Text>
                    </View>
                  ) : (
                    searchResultRows.map((row, index) => (
                      <View key={`${row.label}-${index}`} style={styles.rowWrapper}>
                        <SettingRow
                          item={row}
                          isLast={index === searchResultRows.length - 1}
                          onPress={createRowHandler(row)}
                        />
                      </View>
                    ))
                  )}
                </View>
              </View>
            </>
          ) : (
            <>
              {sections.map(renderSection)}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>General</Text>
                <View
                  style={[
                    styles.card,
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                  ]}
                >
                  <SettingRow
                    item={appearanceRow}
                    onPress={createRowHandler(appearanceRow)}
                    rightElement={
                      <Switch
                        value={isDarkMode}
                        onValueChange={toggleThemeMode}
                        thumbColor={theme.colors.surface}
                        trackColor={{
                          false: withOpacity(theme.colors.textMuted, 0.4),
                          true: theme.colors.accent,
                        }}
                        ios_backgroundColor={withOpacity(theme.colors.textMuted, 0.35)}
                        accessibilityLabel="Toggle dark mode override"
                        style={styles.themeSwitch}
                      />
                    }
                  />
                  {!isUsingSystemTheme ? (
                    <SettingRow
                      item={systemThemeRow}
                      onPress={createRowHandler(systemThemeRow)}
                    />
                  ) : null}
                  <SettingRow
                    item={howItWorksRow}
                    onPress={createRowHandler(howItWorksRow)}
                  />
                  <SettingRow
                    item={supportRow}
                    onPress={createRowHandler(supportRow)}
                    isLast
                  />
                </View>
              </View>
              {renderSection(privacySection)}
              <View style={styles.section}>
                <View style={[styles.card, styles.signOutCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <SettingRow item={signOutRow} isLast onPress={signOutHandler} isWorking={isSigningOut} />
                </View>
              </View>
              <View style={styles.footerInScroll}>
                <Text style={[styles.footerText, { color: withOpacity(theme.colors.text, 0.4) }]}>Verity Protect</Text>
                <Pressable onPress={() => navigation.navigate('WhatsNew' as any)}>
                  <Text style={[styles.footerVersion, { color: theme.colors.accent }]}>
                    Version {Constants.expoConfig?.version ?? '1.0.0'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </Animated.ScrollView>
      </View>
    </SafeAreaView>
  );
}

type SettingRowProps = {
  item: SettingsRowItem;
  isLast?: boolean;
  onPress?: () => void;
  isWorking?: boolean;
  rightElement?: ReactNode;
};

function SettingRow({
  item,
  isLast = false,
  onPress,
  isWorking = false,
  rightElement,
}: SettingRowProps) {
  const { theme } = useTheme();
  const iconColor = item.destructive ? theme.colors.danger : theme.colors.accent;
  const iconBackground = item.destructive
    ? withOpacity(theme.colors.danger, 0.15)
    : theme.colors.surfaceAlt;
  const highlightColor = withOpacity(theme.colors.text, 0.08);
  const rippleColor = withOpacity(theme.colors.text, 0.08);
  const dividerColor = withOpacity(theme.colors.text, 0.1);
  const titleColor = item.destructive ? theme.colors.danger : theme.colors.text;
  return (
    <>
      <Pressable
        style={styles.row}
        onPress={onPress}
        android_ripple={{ color: rippleColor }}
      >
        {({ pressed }) => (
          <>
            <View style={[styles.rowHighlight, pressed && { backgroundColor: highlightColor }]} />
            <View style={styles.rowContent}>
              <View style={[styles.iconBox, { backgroundColor: iconBackground }]}>
                <Ionicons name={item.icon} size={20} color={iconColor} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: titleColor }]}>
                  {isWorking ? 'Working…' : item.label}
                </Text>
                {item.subtitle ? (
                  <Text style={[styles.rowSubtitle, { color: theme.colors.textMuted }]}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
              {rightElement ? (
                <View style={styles.rowRight}>{rightElement}</View>
              ) : isWorking ? (
                <ActivityIndicator color={theme.colors.textMuted} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              )}
            </View>
          </>
        )}
      </Pressable>
      {!isLast && <View style={[styles.divider, { backgroundColor: dividerColor }]} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  content: {
    paddingTop: 12,
  },
  scrollView: {
    flex: 1,
  },
  bodyWrap: {
    flex: 1,
    position: 'relative',
  },
  section: {
    marginTop: 6,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  searchWrap: {
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 18,
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
  card: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  rowRight: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  themeSwitch: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
  rowWrapper: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    position: 'relative',
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowHighlight: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: -24,
    right: -24,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 20,
  },
  rowSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  iconBoxAlt: {},
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68,
    marginVertical: 4,
  },
  signOutCard: {
    marginTop: 0,
  },
  footer: {
    marginTop: 14,
    alignItems: 'center',
    gap: 2,
    paddingBottom: 8,
  },
  footerSticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    alignItems: 'center',
    gap: 2,
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerInScroll: {
    marginTop: 12,
    alignItems: 'center',
    gap: 2,
    paddingBottom: 8,
  },
  footerText: {
    textAlign: 'center',
    letterSpacing: 0.3,
    fontSize: 12,
    fontWeight: '500',
  },
  footerVersion: {
    textAlign: 'center',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  emptyState: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
});
