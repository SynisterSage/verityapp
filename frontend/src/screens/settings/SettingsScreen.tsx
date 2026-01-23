import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEffect } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DashboardHeader from '../../components/common/DashboardHeader';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import type { RouteProp } from '@react-navigation/native';
import type { SettingsStackParamList } from '../../navigation/types';
type SettingsItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
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

  const accountItems: SettingsItem[] = [];
  if (canManageProfile) {
    accountItems.push({
      label: 'Account',
      icon: 'person-outline',
      onPress: () => navigation.navigate('Account'),
    });
    accountItems.push({
      label: 'Members',
      icon: 'people-outline',
      onPress: () => navigation.navigate('Members'),
    });
  }
  accountItems.push({
    label: 'Notifications',
    icon: 'notifications-outline',
    onPress: () => navigation.navigate('Notifications'),
  });
  if (canManageProfile) {
    accountItems.push({
      label: 'Security',
      icon: 'shield-checkmark-outline',
      onPress: () => navigation.navigate('Security'),
    });
  }

  const safetyItems: SettingsItem[] = [
    {
      label: 'Safe Phrases',
      icon: 'chatbubble-ellipses-outline',
      onPress: () => navigation.navigate('SafePhrases'),
    },
    {
      label: 'Trusted Contacts',
      icon: 'people-outline',
      onPress: () => navigation.navigate('TrustedContacts'),
    },
    {
      label: 'Blocked Numbers',
      icon: 'ban-outline',
      onPress: () => navigation.navigate('Blocklist'),
    },
  ];
  if (canManageProfile) {
    safetyItems.push({
      label: 'Automation',
      icon: 'flash-outline',
      onPress: () => navigation.navigate('Automation'),
    });
  }

  const privacyItems: SettingsItem[] = [
    {
      label: 'Data & Privacy',
      icon: 'lock-closed-outline',
      onPress: () => navigation.navigate('DataPrivacy'),
    },
  ];

  useEffect(() => {
    if (!route.params?.initialScreen) {
      return;
    }
    const { initialScreen } = route.params;
    navigation.setParams({ initialScreen: undefined });
    navigation.navigate(initialScreen);
  }, [route.params?.initialScreen, navigation]);

  const bottomGap = Math.max(insets.bottom, 0);

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          paddingTop: Math.max(28, insets.top + 12),
          paddingBottom: bottomGap,
        },
      ]}
      edges={['bottom']}
    >
      <DashboardHeader title="Settings" subtitle="Manage your preferences" align="left" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomGap + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.section, styles.sectionFirst]}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          {accountItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.row, index === accountItems.length - 1 && styles.rowLast]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Ionicons name={item.icon} size={20} color="#8ab4ff" />
                <Text style={styles.rowLabel}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#5d6b85" />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safety Tools</Text>
        <View style={styles.card}>
          {safetyItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.row, index === safetyItems.length - 1 && styles.rowLast]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Ionicons name={item.icon} size={20} color="#8ab4ff" />
                <Text style={styles.rowLabel}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#5d6b85" />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        <View style={styles.card}>
          {privacyItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.row, index === privacyItems.length - 1 && styles.rowLast]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Ionicons name={item.icon} size={20} color="#8ab4ff" />
                <Text style={styles.rowLabel}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#5d6b85" />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={18} color="#f2d6d6" />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 24,
  },
  content: {
    paddingTop: 24,
  },
  section: {
    marginTop: 28,
  },
  sectionFirst: {
    marginTop: 0,
  },
  sectionTitle: {
    color: '#98a7c2',
    fontWeight: '600',
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    overflow: 'hidden',
  },
  row: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1b2534',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    color: '#e4ebf7',
    fontSize: 16,
    fontWeight: '500',
  },
  signOut: {
    marginTop: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3a2a2a',
    backgroundColor: '#1a1214',
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  signOutText: {
    color: '#f2d6d6',
    fontWeight: '600',
  },
});
