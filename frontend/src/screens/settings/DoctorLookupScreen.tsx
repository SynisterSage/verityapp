import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';

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
  const [optimisticTrusted, setOptimisticTrusted] = useState<TrustedProfessional[]>([]);
  const [error, setError] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);

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

  const executeLookup = useCallback(
    async (searchQuery: string) => {
      const trimmedQuery = searchQuery.trim();
      if (!activeProfile?.id || !trimmedQuery) {
        return false;
      }
      setLoading(true);
      setError('');
      setHasSearched(true);
      console.log('[DoctorLookup] executeLookup', { profileId: activeProfile.id, query: trimmedQuery });
      try {
        const { providers: matchedProviders, totalResults: total } = await lookupProviders(activeProfile.id, {
          query: trimmedQuery,
          limit: 6,
        });
        setResults(matchedProviders);
        setTotalResults(total);
        setCurrentQuery(trimmedQuery);
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

  const loadMoreProviders = useCallback(async () => {
    if (
      loadingMore ||
      !activeProfile?.id ||
      !currentQuery ||
      results.length >= totalResults ||
      loading
    ) {
      return;
    }
    setLoadingMore(true);
    try {
      const { providers: moreProviders, totalResults: updatedTotal } = await lookupProviders(activeProfile.id, {
        query: currentQuery,
        limit: 6,
        offset: results.length,
      });
      setResults((prev) => [...prev, ...moreProviders]);
      setTotalResults(updatedTotal);
    } catch (err) {
      setError('Lookup failed. Try again.');
    } finally {
      setLoadingMore(false);
    }
  }, [activeProfile?.id, currentQuery, results.length, totalResults, loading, loadingMore]);

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

  const buildTrustedFromProvider = useCallback(
    (provider: ProfessionalLookupResult): TrustedProfessional => ({
      id: `lookup:${provider.placeId}:${provider.phones[0] ?? ''}`,
      caller_number: provider.phones[0] ?? null,
      contact_name: provider.name,
      relationship_tag: provider.category ?? 'Doctor',
      source: 'professional_lookup',
      caller_hash: null,
      trusted_care_team: true,
    }),
    []
  );

  const handleAdd = useCallback(async (provider: ProfessionalLookupResult) => {
    if (!activeProfile?.id) {
      return;
    }
    const optimistic = buildTrustedFromProvider(provider);
    setOptimisticTrusted((prev) => [...prev, optimistic]);
    setSavingProviderId(provider.placeId);
    try {
      await addTrustedProfessional(activeProfile.id, provider);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      fetchTrusted();
    } catch (err) {
      setOptimisticTrusted((prev) => prev.filter((entry) => entry.id !== optimistic.id));
      console.error('Doctor lookup add error', err);
      setError((err as any)?.message ?? 'Unable to add this provider right now.');
    } finally {
      setSavingProviderId(null);
    }
  }, [activeProfile?.id, buildTrustedFromProvider, fetchTrusted]);

  const handleRemove = useCallback(async (id: string) => {
    await removeTrustedProfessional(id);
    fetchTrusted();
    setOptimisticTrusted((prev) => prev.filter((contact) => contact.id !== id));
  }, [fetchTrusted]);

  const includesDoctorTag = (contact: TrustedProfessional) =>
    (contact.relationship_tag ?? '').toLowerCase().includes('doctor');
  const doctorTrusted = useMemo(() => {
    const uniq = new Map<string, TrustedProfessional>();
    [...trusted, ...optimisticTrusted].forEach((contact) => {
      const shouldInclude = contact.source === 'professional_lookup' || includesDoctorTag(contact);
      if (!shouldInclude) {
        return;
      }
      const key = `${contact.id}:${contact.caller_number}`;
      if (!uniq.has(key)) {
        uniq.set(key, contact);
      }
    });
    return Array.from(uniq.values());
  }, [trusted, optimisticTrusted]);
  const trustedPhoneSet = useMemo(
    () =>
      new Set(
        doctorTrusted
          .map((prof) => prof.caller_number)
          .filter((phone): phone is string => Boolean(phone))
      ),
    [doctorTrusted]
  );
  const isTrustedProvider = useCallback(
    (provider: ProfessionalLookupResult) => provider.phones.some((phone) => trustedPhoneSet.has(phone)),
    [trustedPhoneSet]
  );

  const trustedSection = useMemo(
    () => (
      <View style={[styles.trustedWrapper, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <View style={styles.trustedHeader}>
          <Text style={[styles.searchLabel, { color: theme.colors.textMuted }]}>Trusted Care Team</Text>
          <Text style={[styles.activeBadge, { color: theme.colors.accent }]}>
            {doctorTrusted.length} Active
          </Text>
        </View>
        {doctorTrusted.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>Add providers to your safe list</Text>
        ) : (
          doctorTrusted.map((contact) => (
            <View
              key={contact.id}
              style={[
                styles.trustedRow,
                {
                  backgroundColor: colors.surfaceAlt ?? colors.surface,
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
    [handleRemove, theme.colors, doctorTrusted, colors.surfaceAlt, colors.surface]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={[]}>
      <SettingsHeader title="Doctor Lookup" subtitle="Trusted Professionals" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 32) + 150, paddingTop: 26 }}>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.heroIcon, { backgroundColor: withOpacity(theme.colors.accent, 0.15) }]}>
            <Ionicons name="analytics-outline" size={20} color={theme.colors.accent} />
          </View>
          <View style={styles.heroText}>
            <Text style={[styles.heroTitle, { color: theme.colors.text }]}>Recognition Engine</Text>
            <Text style={[styles.heroBody, { color: theme.colors.textMuted }]}>NPPES NPI Registry • care teams call from rotating vanity numbers in your area.</Text>
          </View>
        </View>
        <View style={[styles.searchModule, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Search Directory</Text>
          <Text style={[styles.searchLabel, { color: colors.textMuted }]}>ZIP Code or City</Text>
          <View style={styles.searchRow}>
            <View style={[styles.inputWrapper, { backgroundColor: withOpacity(colors.text, 0.05) }]}>
              <Ionicons name="locate" size={20} color={colors.textMuted} />
              <TextInput
                style={[styles.searchInput, { flex: 1, color: colors.text, borderColor: 'transparent' }]}
                placeholder="07450 or Wayne, NJ"
                placeholderTextColor={withOpacity(colors.textMuted, 0.7)}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
              />
            </View>
            <Pressable
              style={[styles.navButton, { backgroundColor: colors.accent }]}
              onPress={handleUseLocation}
              disabled={locationLoading}
            >
              {locationLoading ? <Loader /> : <Ionicons name="navigate" size={20} color="white" />}
            </Pressable>
          </View>
          {error ? <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text> : null}
          <Pressable
            style={[styles.lookupButton, { backgroundColor: theme.colors.accent }]}
            onPress={handleLookup}
            disabled={loading}
          >
            {loading ? (
              <Loader />
            ) : (
              <Text style={[styles.lookupButtonText, { color: '#fff' }]}>Lookup Providers</Text>
            )}
          </Pressable>
          <View style={[styles.resultList, { borderColor: withOpacity(theme.colors.textMuted, 0.2) }]}>
            {results.length === 0 && !loading && hasSearched ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, { color: theme.colors.textMuted }]}>
                  We couldn’t find any providers in that area.
                </Text>
                <Text style={[styles.emptyStateSubtext, { color: theme.colors.textMuted }]}>
                  Try another ZIP code or city, or tap the location icon again.
                </Text>
              </View>
            ) : null}
            {results.map((item) => {
              const saving = savingProviderId === item.placeId;
              const trustedState = isTrustedProvider(item);
              return (
                <View key={item.placeId} style={[styles.resultRow, { backgroundColor: colors.surfaceAlt ?? colors.surface, borderColor: colors.border }]}>
                  <View style={styles.resultContent}>
                    <View style={styles.providerText}>
                      <Text style={[styles.providerName, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.providerMeta, { color: colors.textMuted }]}>{item.category ?? 'Provider'}</Text>
                      <Text style={[styles.providerMeta, { color: colors.textMuted }]}>
                        {item.displayAddress}
                      </Text>
                      {item.phones.length > 0 && (
                        <Text style={[styles.providerMeta, { color: colors.textMuted, marginTop: 2 }]}>{item.phones[0]}</Text>
                      )}
                    </View>
                  </View>
                  <Pressable
                    style={[
                      styles.addButtonCircle,
                      {
                        backgroundColor: trustedState ? withOpacity(theme.colors.accent, 0.15) : colors.accent,
                        borderWidth: trustedState ? StyleSheet.hairlineWidth : 0,
                        borderColor: trustedState ? colors.border : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      if (trustedState || saving) {
                        return;
                      }
                      handleAdd(item);
                    }}
                    disabled={saving || trustedState}
                    android_ripple={{ color: withOpacity(colors.text, 0.15) }}
                    accessibilityLabel={`${trustedState ? 'Trusted' : 'Add'} ${item.name}`}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Ionicons name={trustedState ? 'checkmark' : 'add'} size={18} color={trustedState ? colors.accent : '#fff'} />
                    )}
                  </Pressable>
                </View>
              );
            })}
            {results.length < totalResults ? (
              <Pressable
                style={[styles.loadMoreButton, { borderColor: colors.border }]}
                onPress={loadMoreProviders}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={[styles.loadMoreText, { color: colors.accent }]}>Load more providers</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
        {trustedSection}
      </ScrollView>
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
  searchModule: {
    borderRadius: 22,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  heroCard: {
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  heroBody: {
    fontSize: 13,
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
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 0,
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
  resultList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    paddingTop: 12,
  },
  resultContent: {
    flex: 1,
    flexDirection: 'column',
    gap: 4,
    marginRight: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    width: '100%',
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
    flex: 1,
  },
  providerName: {
    fontWeight: '600',
    fontSize: 16,
  },
  providerMeta: {
    fontSize: 13,
  },
  addButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    alignSelf: 'center',
    marginLeft: 8,
    elevation: 2,
  },
  loadMoreButton: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 12,
    textAlign: 'center',
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
