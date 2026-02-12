import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import SettingsHeader from '../../components/common/SettingsHeader';
import ActionFooter from '../../components/onboarding/ActionFooter';
import { useTheme } from '../../context/ThemeContext';
import { useProfile } from '../../context/ProfileContext';
import {
  lookupProviders,
  listTrustedProfessionals,
  addTrustedProfessional,
  removeTrustedProfessional,
  ProfessionalLookupResult,
  TrustedProfessional,
} from '../../services/professionalLookup';
import { withOpacity } from '../../utils/color';

  const Loader = () => <ActivityIndicator size="small" color="rgba(255,255,255,0.85)" />;

export default function DoctorLookupScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme();
  const colors = theme.colors as {
    surface: string;
    surfaceAlt?: string;
    text: string;
    textMuted: string;
    border: string;
    accent: string;
    danger: string;
    bg?: string;
  };
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProfessionalLookupResult[]>([]);
  const [trusted, setTrusted] = useState<TrustedProfessional[]>([]);
  const [error, setError] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);

  const fetchTrusted = useCallback(async () => {
    if (!activeProfile?.id) {
      return;
    }
    const professionals = await listTrustedProfessionals(activeProfile.id);
    setTrusted(professionals);
  }, [activeProfile?.id]);

  useMemo(() => {
    fetchTrusted();
  }, [fetchTrusted]);

  const listRef = useRef<FlatList<ProfessionalLookupResult>>(null);

  const executeLookup = useCallback(
    async (searchQuery: string) => {
      const trimmedQuery = searchQuery.trim();
      if (!activeProfile?.id || !trimmedQuery) {
        return false;
      }
      setLoading(true);
      setError('');
      console.log('[DoctorLookup] executeLookup', { profileId: activeProfile.id, query: trimmedQuery });
      try {
        const matchedProviders = await lookupProviders(activeProfile.id, {
          query: trimmedQuery,
          limit: 6,
        });
        setResults(matchedProviders);
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
        return matchedProviders.length > 0;
      } catch (err) {
        setError('Lookup failed. Try again.');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [activeProfile?.id]
  );

  const handleLookup = useCallback(() => {
    executeLookup(query);
  }, [executeLookup, query]);

  const handleUseLocation = useCallback(async () => {
    if (!activeProfile?.id) {
      console.log('[DoctorLookup] handleUseLocation aborted: missing profile');
      return;
    }
    setLocationLoading(true);
    setError('');
    console.log('[DoctorLookup] handleUseLocation start', { profileId: activeProfile.id });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[DoctorLookup] requested location permission', status);
      if (status !== Location.PermissionStatus.GRANTED) {
        setError('Enable location access to look up nearby providers.');
        return;
      }
      console.log('[DoctorLookup] permission granted, fetching position');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      console.log('[DoctorLookup] position received', position.coords);
      const addresses = await Location.reverseGeocodeAsync(position.coords);
      const firstAddress = addresses[0];
      const locationLabel =
        firstAddress?.postalCode ??
        (firstAddress?.city ? `${firstAddress.city}${firstAddress.region ? `, ${firstAddress.region}` : ''}` : '');
      if (!locationLabel) {
        setError('Unable to resolve your ZIP code. Please enter it manually.');
        return;
      }
      setQuery(locationLabel);
      await executeLookup(locationLabel);
    } catch (err: any) {
      console.error('Doctor lookup location error', err);
      setError(err?.message ? err.message : 'Unable to fetch location. Try again.');
    } finally {
      setLocationLoading(false);
    }
  }, [activeProfile?.id]);

  const handleAdd = useCallback(async (provider: ProfessionalLookupResult) => {
    if (!activeProfile?.id) {
      return;
    }
    await addTrustedProfessional(activeProfile.id, provider);
    fetchTrusted();
  }, [activeProfile?.id, fetchTrusted]);

  const handleRemove = useCallback(async (id: string) => {
    await removeTrustedProfessional(id);
    fetchTrusted();
  }, [fetchTrusted]);

  const searchSection = useMemo(
    () => (
      <View style={[styles.searchCard, { backgroundColor: theme.colors.surface }]}> 
        <Text style={[styles.searchLabel, { color: theme.colors.textMuted }]}>ZIP Code or City</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text, borderColor: theme.colors.border }]}
            placeholder="e.g. Wayne, New Jersey"
            placeholderTextColor={withOpacity(theme.colors.textMuted, 0.6)}
            value={query}
            onChangeText={setQuery}
          />
          <Pressable
            style={[styles.navButton, { backgroundColor: theme.colors.accent }]}
            onPress={handleUseLocation}
            disabled={locationLoading}
          >
            {locationLoading ? <Loader /> : <Ionicons name="navigate" size={20} color="white" />}
          </Pressable>
        </View>
        <Pressable style={[styles.lookupButton, { backgroundColor: theme.colors.accent }]} onPress={handleLookup}>
          {loading ? <Loader /> : <Text style={styles.lookupButtonText}>Lookup Providers</Text>}
        </Pressable>
        {error ? <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text> : null}
      </View>
    ),
    [handleLookup, loading, query, theme.colors, error]
  );

  const trustedSection = useMemo(
    () => (
      <View style={[styles.trustedWrapper, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <View style={styles.trustedHeader}>
          <Text style={[styles.searchLabel, { color: theme.colors.textMuted }]}>Trusted Care Team</Text>
          <Text style={[styles.activeBadge, { color: theme.colors.accent }]}>
            {trusted.length} Active
          </Text>
        </View>
        {trusted.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>Add providers to your safe list</Text>
        ) : (
          trusted.map((contact) => (
            <View
              key={contact.id}
              style={[
                styles.trustedRow,
                {
                  backgroundColor: theme.colors.surfaceAlt,
                  borderColor: withOpacity(theme.colors.textMuted, 0.25),
                },
              ]}
            >
              <View style={styles.trustedMeta}>
                <View style={[styles.trustedIcon, { backgroundColor: withOpacity(theme.colors.accent, 0.18) }]}>
                  <Ionicons name="checkmark-circle" size={18} color={theme.colors.accent} />
                </View>
                <View style={styles.trustedText}>
                  <Text style={[styles.providerName, { color: theme.colors.text }]}>{contact.contact_name ?? contact.caller_number}</Text>
                  <Text style={[styles.providerMeta, { color: theme.colors.textMuted }]}>{contact.relationship_tag ?? 'Professional'}</Text>
                </View>
              </View>
              <Pressable style={[styles.trashButton, { backgroundColor: withOpacity(theme.colors.danger, 0.2) }]} onPress={() => handleRemove(contact.id)}>
                <Ionicons name="trash" size={16} color={theme.colors.danger} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    ),
    [handleRemove, theme.colors, trusted]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={[]}> 
      <SettingsHeader title="Doctor Lookup" subtitle="Trusted Professionals" />
      <FlatList
        data={results}
        keyExtractor={(item) => item.placeId}
        renderItem={({ item }) => (
          <View style={[styles.providerRow, { borderColor: theme.colors.border }]}> 
            <View style={styles.providerInfo}>
              <Ionicons name="medkit-outline" size={18} color={theme.colors.accent} />
              <View style={styles.providerText}>
                <Text style={[styles.providerName, { color: theme.colors.text }]}>{item.name}</Text>
                <Text style={[styles.providerMeta, { color: theme.colors.textMuted }]}> {item.category ?? 'Provider'} • {item.displayAddress}</Text>
              </View>
            </View>
            <Pressable style={[styles.addButton, { backgroundColor: theme.colors.accent }]} onPress={() => handleAdd(item)}>
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          </View>
        )}
        ListHeaderComponent={
          <>
            <View style={[styles.badge, { backgroundColor: theme.colors.surface }]}> 
              <Ionicons name="analytics-outline" size={20} color={theme.colors.accent} />
              <Text style={[styles.badgeText, { color: theme.colors.text }]}>Recognition Engine · care teams call from rotating numbers.</Text>
            </View>
            {searchSection}
          </>
        }
        ListEmptyComponent={null}
        ListFooterComponent={trustedSection}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 64, paddingTop: insets.top +  0}}
        ListHeaderComponentStyle={{ paddingTop: 0 }}
      />
      <ActionFooter
        primaryLabel="Back to Settings"
        onPrimaryPress={() => navigation.goBack()}
        primaryTextColor="#ffffff"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  badge: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badgeText: {
    fontSize: 14,
    flex: 1,
  },
  searchCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  searchLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 16,
  },
  navButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookupButton: {
    marginBottom: 12,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookupButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  providerText: {
    maxWidth: 220,
  },
  providerName: {
    fontWeight: '600',
    fontSize: 16,
  },
  providerMeta: {
    fontSize: 13,
  },
  addButton: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#94a3b8',
    paddingVertical: 12,
  },
  trustedWrapper: {
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
  },
  trustedHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  activeBadge: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  trustedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  trustedIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  trustedText: {
    flex: 1,
  },
  trustedCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  trustedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  trashButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    letterSpacing: 0.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  errorText: {
    fontSize: 13,
  },
});
