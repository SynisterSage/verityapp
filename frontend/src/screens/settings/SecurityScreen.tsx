import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';

export default function SecurityScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { activeProfile, canManageProfile } = useProfile();

  const provider = session?.user?.app_metadata?.provider ?? 'email';
  const isEmailProvider = provider === 'email';
  const passcodeStatus = activeProfile?.has_passcode ? 'Set' : 'Not set';

  const helperText = useMemo(() => {
    if (isEmailProvider) {
      return 'Passcodes protect your loved one from unwanted callers.';
    }
    return 'Passcode changes are only available for email/password accounts.';
  }, [isEmailProvider]);

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: Math.max(28, insets.top + 12) }]}
      edges={[]}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#e4ebf7" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security</Text>
      </View>

      <Text style={styles.sectionTitle}>Passcode</Text>
      {!canManageProfile && (
        <View style={styles.card}>
          <Text style={styles.disabledText}>Only caretakers can manage security settings.</Text>
        </View>
      )}
      {canManageProfile && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>{passcodeStatus}</Text>
          </View>
          <Text style={styles.helper}>{helperText}</Text>
          <TouchableOpacity
            style={[styles.primaryButton, !isEmailProvider && styles.primaryDisabled]}
            onPress={() => navigation.navigate('ChangePasscode')}
            disabled={!isEmailProvider}
          >
            <Text style={styles.primaryText}>Change passcode</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 0,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121a26',
    borderWidth: 1,
    borderColor: '#1f2a3a',
  },
  headerTitle: {
    color: '#f5f7fb',
    fontSize: 28,
    fontWeight: '700',
    marginLeft: 12,
  },
  sectionTitle: {
    color: '#98a7c2',
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202c3c',
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#8aa0c6',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    color: '#e6ebf5',
    fontWeight: '600',
  },
  helper: {
    color: '#8aa0c6',
  },
  primaryButton: {
    backgroundColor: '#2d6df6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryDisabled: {
    opacity: 0.5,
  },
  primaryText: {
    color: '#f5f7fb',
    fontWeight: '600',
  },
  disabledText: {
    color: '#8aa0c6',
    textAlign: 'center',
  },
});
