import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { useTheme } from '../../context/ThemeContext';
import { navigateToSupportPortal } from '../../navigation/rootNavigator';
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
const RESULTS_PAGE_SIZE = 10;

function truncateLabel(value?: string | null, maxLength = 56) {
  if (!value) {
    return '';
  }
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export default function DoctorLookupScreen({ navigation }: { navigation: any }) {
  const { mode, theme } = useTheme();
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
  const [nameQuery, setNameQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProfessionalLookupResult[]>([]);
  const [trusted, setTrusted] = useState<TrustedProfessional[]>([]);
  const [optimisticTrusted, setOptimisticTrusted] = useState<TrustedProfessional[]>([]);
  const [error, setError] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingTrusted, setLoadingTrusted] = useState(true);
  const [currentQuery, setCurrentQuery] = useState('');
  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
  const [deletingTrustedId, setDeletingTrustedId] = useState<string | null>(null);
  const trustedShimmer = useRef(new Animated.Value(0.45)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [lastPageSize, setLastPageSize] = useState(0);
  const [lastResolvedLocation, setLastResolvedLocation] = useState<string | null>(null);

  const fetchTrusted = useCallback(async () => {
    if (!activeProfile?.id) {
      setTrusted([]);
      setLoadingTrusted(false);
      return;
    }
    setLoadingTrusted(true);
    try {
      const professionals = await listTrustedProfessionals(activeProfile.id);
      setTrusted(professionals);
    } catch (err) {
      console.error('Doctor lookup trusted list error', err);
      setTrusted([]);
    } finally {
      setLoadingTrusted(false);
    }
  }, [activeProfile?.id]);

  useEffect(() => {
    void fetchTrusted();
  }, [fetchTrusted]);

  const executeLookup = useCallback(
    async (searchQuery: string) => {
      const trimmedQuery = searchQuery.trim();
      const trimmedName = nameQuery.trim();
      const fallbackLocation = lastResolvedLocation ??
        (activeProfile?.zip_code ?? activeProfile?.city ?? '').trim();
      const effectiveQuery = trimmedQuery || trimmedName || fallbackLocation;
      if (!activeProfile?.id || !effectiveQuery) {
        if (!effectiveQuery) {
          setError('Enter a ZIP code, city, or provider name first.');
        }
        return false;
      }
      setLoading(true);
      setError('');
      setHasSearched(true);
      console.log('[DoctorLookup] executeLookup', {
        profileId: activeProfile.id,
        query: effectiveQuery,
        fallbackLocation: !trimmedQuery && !trimmedName ? fallbackLocation : undefined,
      });
      try {
        const { providers: matchedProviders, totalResults: total } = await lookupProviders(activeProfile.id, {
          query: effectiveQuery,
          name: trimmedName || undefined,
          limit: RESULTS_PAGE_SIZE,
        });
        setResults(matchedProviders);
        setTotalResults(total);
        setLastPageSize(matchedProviders.length);
        setCanLoadMore(total > matchedProviders.length || matchedProviders.length === RESULTS_PAGE_SIZE);
        setCurrentQuery(effectiveQuery);
        if (trimmedQuery) {
          setLastResolvedLocation(trimmedQuery);
        }
        return matchedProviders.length > 0;
      } catch (err) {
        setError('Lookup failed. Try again.');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [activeProfile?.id, nameQuery]
  );

  const loadMoreProviders = useCallback(async () => {
    const hasMoreResults = results.length < totalResults || canLoadMore;
    if (
      loadingMore ||
      !activeProfile?.id ||
      !currentQuery ||
      !hasMoreResults ||
      loading
    ) {
      return;
    }
    setLoadingMore(true);
    try {
    const offset = results.length;
      const { providers: moreProviders, totalResults: updatedTotal } = await lookupProviders(activeProfile.id, {
        query: currentQuery,
        name: nameQuery.trim() || undefined,
        limit: RESULTS_PAGE_SIZE,
        offset,
      });
    setResults((prev) => [...prev, ...moreProviders]);
    setTotalResults(updatedTotal);
    setLastPageSize(moreProviders.length);
    setCanLoadMore(updatedTotal > offset + moreProviders.length || moreProviders.length === RESULTS_PAGE_SIZE);
    scrollViewRef.current?.scrollToEnd({ animated: true });
    } catch (err) {
      setError('Lookup failed. Try again.');
    } finally {
      setLoadingMore(false);
    }
  }, [activeProfile?.id, currentQuery, nameQuery, results.length, totalResults, loading, loadingMore]);

  const handleLookup = useCallback(() => {
    executeLookup(query);
  }, [executeLookup, query, nameQuery]);

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
      contact_name: truncateLabel(provider.name, 64),
      relationship_tag: provider.category ?? 'Doctor',
      source: 'professional_lookup',
      caller_hash: null,
      trusted_care_team: true,
      professional_lookup_place_id: provider.placeId,
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
      await fetchTrusted();
      setOptimisticTrusted((prev) => prev.filter((entry) => entry.id !== optimistic.id));
    } catch (err) {
      setOptimisticTrusted((prev) => prev.filter((entry) => entry.id !== optimistic.id));
      console.error('Doctor lookup add error', err);
      setError((err as any)?.message ?? 'Unable to add this provider right now.');
    } finally {
      setSavingProviderId(null);
    }
  }, [activeProfile?.id, buildTrustedFromProvider, fetchTrusted]);

  const handleRemove = useCallback(async (id: string) => {
    setDeletingTrustedId(id);
    try {
      await removeTrustedProfessional(id);
      fetchTrusted();
      setOptimisticTrusted((prev) => prev.filter((contact) => contact.id !== id));
    } finally {
      setDeletingTrustedId(null);
    }
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
  const trustedPlaceIdSet = useMemo(
    () =>
      new Set(
        doctorTrusted
          .map((prof) => prof.professional_lookup_place_id)
          .filter((id): id is string => Boolean(id))
      ),
    [doctorTrusted]
  );
  const isTrustedProvider = useCallback(
    (provider: ProfessionalLookupResult) =>
      trustedPlaceIdSet.has(provider.placeId) ||
      provider.phones.some((phone) => trustedPhoneSet.has(phone)),
    [trustedPhoneSet, trustedPlaceIdSet]
  );

  const trustedSkeletonRows = useMemo(() => Array.from({ length: 3 }, (_, index) => `trusted-skeleton-${index}`), []);
  const showTrustedSkeleton = loadingTrusted && doctorTrusted.length === 0;
  useEffect(() => {
    if (!showTrustedSkeleton) {
      trustedShimmer.setValue(0.45);
      return;
    }
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(trustedShimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(trustedShimmer, {
          toValue: 0.45,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerLoop.start();
    return () => shimmerLoop.stop();
  }, [showTrustedSkeleton, trustedShimmer]);
  const trustedSection = useMemo(
    () => (
      <View style={[styles.trustedWrapper, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <View style={styles.trustedHeader}>
          <Text style={[styles.searchLabel, { color: theme.colors.textMuted }]}>Trusted Care Team</Text>
          <Text style={[styles.activeBadge, { color: theme.colors.accent }]}>
            {doctorTrusted.length} Active
          </Text>
        </View>
        {showTrustedSkeleton ? (
          <View style={styles.trustedSkeletonList}>
            {trustedSkeletonRows.map((key) => (
              <Animated.View
                key={key}
                style={[
                  styles.trustedSkeletonCard,
                  { backgroundColor: withOpacity(theme.colors.text, 0.08), opacity: trustedShimmer },
                ]}
              >
                <View style={[styles.trustedSkeletonLineShort, { backgroundColor: withOpacity(theme.colors.text, 0.2) }]} />
                <View style={[styles.trustedSkeletonLineLong, { backgroundColor: withOpacity(theme.colors.text, 0.15) }]} />
              </Animated.View>
            ))}
          </View>
        ) : doctorTrusted.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>Add providers to your safe list</Text>
        ) : (
          doctorTrusted.map((contact) => {
            const isDeleting = deletingTrustedId === contact.id;
            return (
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
                  <View style={[styles.trustedText, { marginRight: 12 }]}>
                    <Text
                      style={[styles.providerName, { color: theme.colors.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {truncateLabel(contact.contact_name ?? contact.caller_number, 20)}
                    </Text>
                    <Text style={[styles.providerMeta, { color: theme.colors.textMuted }]}>{contact.relationship_tag ?? 'Professional'}</Text>
                  </View>
                </View>
                <Pressable
                  style={[
                    styles.trashButton,
                    { backgroundColor: withOpacity(theme.colors.danger, 0.2) },
                  ]}
                  onPress={() => handleRemove(contact.id)}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={theme.colors.text} />
                  ) : (
                    <Ionicons name="trash" size={16} color={theme.colors.danger} />
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </View>
    ),
    [handleRemove, theme.colors, doctorTrusted, colors.surfaceAlt, colors.surface, deletingTrustedId, showTrustedSkeleton, trustedSkeletonRows, trustedShimmer]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]} edges={[]}>
      <SettingsHeader title="Doctor Lookup" subtitle="Trusted Professionals" />
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 32) + 50, paddingTop: 26 }}
          showsVerticalScrollIndicator={false}
          indicatorStyle={mode === 'light' ? 'black' : 'white'}
        >
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
          <Text style={[styles.searchLabel, { color: colors.textMuted, marginTop: 6 }]}>Name or Office (optional)</Text>
          <View style={[styles.inputWrapper, { backgroundColor: withOpacity(colors.text, 0.05), marginBottom: 12 }]}>
            <Ionicons name="person" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { flex: 1, color: colors.text, borderColor: 'transparent' }]}
              placeholder="e.g., Dr. Smith or Valley Health"
              placeholderTextColor={withOpacity(colors.textMuted, 0.7)}
              value={nameQuery}
              onChangeText={setNameQuery}
              returnKeyType="search"
            />
          </View>
          {error ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: withOpacity(theme.colors.danger, 0.12),
                  borderColor: withOpacity(theme.colors.danger, 0.35),
                },
              ]}
            >
              <Ionicons name="alert-circle-outline" size={14} color={theme.colors.danger} />
              <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
            </View>
          ) : null}
          <Pressable
            style={[styles.lookupButton, { backgroundColor: theme.colors.accent }]}
            onPress={handleLookup}
            disabled={loading}
          >
            <View style={styles.lookupButtonContent}>
              {loading ? <Loader /> : null}
              <Text style={[styles.lookupButtonText, { color: '#fff' }]}>
                {loading ? 'Working…' : 'Lookup Providers'}
              </Text>
            </View>
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
              const busyWithOther = Boolean(savingProviderId) && !saving;
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
                      if (trustedState || saving || busyWithOther) {
                        return;
                      }
                      handleAdd(item);
                    }}
                    disabled={saving || trustedState || busyWithOther}
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
            {(() => {
              const showLoadMore =
                (results.length < totalResults) ||
                (lastPageSize === RESULTS_PAGE_SIZE && results.length > 0) ||
                canLoadMore;
              return showLoadMore ? (
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
              ) : null;
            })()}
          </View>
        </View>
        {trustedSection}
        <Pressable
          style={({ pressed }) => [
            styles.supportCard,
            {
              backgroundColor: colors.surfaceAlt ?? colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
            navigateToSupportPortal();
          }}
        >
          <View style={styles.supportIcon}>
            <Ionicons name="help-circle-outline" size={20} color={colors.accent} />
          </View>
          <View style={styles.supportText}>
            <Text style={[styles.supportTitle, { color: colors.text }]}>Didn’t find your office?</Text>
            <Text style={[styles.supportSubtitle, { color: colors.textMuted }]}>
              Contact support to verify it for you.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      </ScrollView>
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
  lookupButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    marginTop: 0,
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
    minWidth: 0,
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
    minWidth: 0,
    flexShrink: 1,
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
    overflow: 'hidden',
  },
  trustedSkeletonList: {
    marginBottom: 12,
  },
  trustedSkeletonCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  trustedSkeletonLineShort: {
    height: 10,
    borderRadius: 6,
    marginBottom: 6,
    width: '55%',
  },
  trustedSkeletonLineLong: {
    height: 10,
    borderRadius: 6,
    width: '35%',
  },
  trashButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  supportIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  supportText: {
    flex: 1,
    paddingRight: 12,
  },
  supportTitle: {
    fontWeight: '600',
    fontSize: 14,
  },
  supportSubtitle: {
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 14,
    letterSpacing: 0.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  errorBanner: {
    marginTop: 4,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
});
