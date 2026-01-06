import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../../context/AuthContext';

export default function HomeScreen({ navigation }: { navigation: any }) {
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? 'Account';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SafeCall</Text>
      <Text style={styles.subtitle}>{email}</Text>

      <View style={styles.grid}>
        <TouchableOpacity style={styles.tile} onPress={() => navigation.navigate('Calls')}>
          <Text style={styles.tileLabel}>Calls</Text>
          <Text style={styles.tileHint}>Transcripts + fraud</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tile} onPress={() => navigation.navigate('Alerts')}>
          <Text style={styles.tileLabel}>Alerts</Text>
          <Text style={styles.tileHint}>Critical flags</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tile} onPress={() => navigation.navigate('SafePhrases')}>
          <Text style={styles.tileLabel}>Safe Phrases</Text>
          <Text style={styles.tileHint}>Reduce false flags</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tile} onPress={() => navigation.navigate('Blocklist')}>
          <Text style={styles.tileLabel}>Blocklist</Text>
          <Text style={styles.tileHint}>Auto‑blocked callers</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b111b',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f5f7fb',
  },
  subtitle: {
    color: '#8aa0c6',
    marginTop: 6,
  },
  grid: {
    marginTop: 24,
    gap: 16,
  },
  tile: {
    backgroundColor: '#121a26',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#202c3c',
  },
  tileLabel: {
    color: '#f5f7fb',
    fontWeight: '600',
    fontSize: 16,
  },
  tileHint: {
    color: '#8aa0c6',
    marginTop: 6,
  },
  signOut: {
    marginTop: 32,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2b3c57',
    alignItems: 'center',
  },
  signOutText: {
    color: '#d2daea',
  },
});
