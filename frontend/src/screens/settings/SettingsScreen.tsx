import { ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import DashboardHeader from '../../components/common/DashboardHeader';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import type { RouteProp } from '@react-navigation/native';
import type { SettingsStackParamList } from '../../navigation/types';
type SettingsRowItem = {
  label: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  destructive?: boolean;
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
  const [isSigningOut, setIsSigningOut] = useState(false);

  const accountRows: SettingsRowItem[] = useMemo(() => {
    const rows: SettingsRowItem[] = [];
    if (canManageProfile) {
      rows.push({
        label: 'Account',
        subtitle: 'Profile & safety options',
        icon: 'person-outline',
        onPress: () => navigation.navigate('Account'),
      });
      rows.push({
        label: 'Members',
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
        subtitle: 'Smart AI screening rules',
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

  const sections = useMemo(
    () => [
      { title: 'Account', rows: accountRows },
      { title: 'Safety intelligence', rows: safetyRows },
      { title: 'Privacy', rows: privacyRows },
    ],
    [accountRows, safetyRows, privacyRows]
  );

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
  const signOutHandler = createRowHandler(signOutRow);

  const renderSection = (section: { title: string; rows: SettingsRowItem[] }) => (
    <View key={section.title} style={styles.section}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.card}>
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
          paddingBottom: Math.max(0, insets.bottom +0),
        },
      ]}
      edges={['bottom']}
    >

        <DashboardHeader title="Settings" subtitle="Manage your preferences" align="left" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomGap + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {sections.map(renderSection)}
        <View style={styles.section}>
          <View style={[styles.card, styles.signOutCard]}>
            <SettingRow item={signOutRow} isLast onPress={signOutHandler} isWorking={isSigningOut} />
          </View>
        </View>
        <Text style={styles.footerText}>Verity Protect. All rights reserved.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type SettingRowProps = {
  item: SettingsRowItem;
  isLast?: boolean;
  onPress?: () => void;
  isWorking?: boolean;
};

function SettingRow({ item, isLast = false, onPress, isWorking = false }: SettingRowProps) {
  const iconColor = item.destructive ? '#f87171' : '#8aa0c6';
  return (
    <>
      <Pressable
        style={styles.row}
        onPress={onPress}
        android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
      >
        {({ pressed }) => (
          <>
            <View style={[styles.rowHighlight, pressed && styles.rowHighlightActive]} />
            <View style={styles.rowContent}>
              <View
                style={[
                  styles.iconBox,
                  item.destructive ? styles.iconBoxDestructive : styles.iconBoxAlt,
                ]}
              >
                <Ionicons name={item.icon} size={20} color={iconColor} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, item.destructive && styles.rowTitleDestructive]}>
                  {isWorking ? 'Working…' : item.label}
                </Text>
                {item.subtitle ? (
                  <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
                ) : null}
              </View>
              {isWorking ? (
                <ActivityIndicator color="#94a3b8" />
              ) : (
                <Ionicons name="chevron-forward" size={18} color="#5d6b85" />
              )}
            </View>
          </>
        )}
      </Pressable>
      {!isLast && <View style={styles.divider} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f141d',
    paddingHorizontal: 24,
  },
  content: {
    paddingTop: 24,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 6,
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#8aa0c6',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  rowWrapper: {
    backgroundColor: '#121a26',
  },
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
    backgroundColor: 'transparent',
  },
  rowHighlightActive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#f5f7fb',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 20,
  },
  rowTitleDestructive: {
    color: '#f87171',
  },
  rowSubtitle: {
    color: 'rgba(138,168,198,0.6)',
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
    backgroundColor: '#242c3d',
  },
  iconBoxAlt: {
    backgroundColor: '#242c3d',
  },
  iconBoxDestructive: {
    backgroundColor: 'rgba(248,113,113,0.1)',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginLeft: 68,
    marginVertical: 4,
  },
  signOutCard: {
    marginTop: 0,
  },
  footerText: {
    marginTop: 32,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.32)',
    letterSpacing: 0.3,
    fontSize: 12,
  },
});
