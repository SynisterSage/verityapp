import fetch from 'node-fetch';
import logger from 'jet-logger';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const REVERSE_NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const CACHE_TTL_MS = 5 * 60 * 1000;

type DerivedLocation = {
  postalCode?: string;
  city?: string;
  state?: string;
  displayLabel?: string;
};

export type ProfessionalLookupResult = {
  name: string;
  displayAddress: string;
  phones: string[];
  type: string | null;
  category: string | null;
  placeId: string;
  latitude?: number;
  longitude?: number;
};

type LookupOptions = {
  query?: string;
  limit?: number;
  lat?: number;
  lon?: number;
  radiusMeters?: number;
};

type CacheEntry = {
  expiresAt: number;
  data: ProfessionalLookupResponse;
};

export type ProfessionalLookupResponse = {
  providers: ProfessionalLookupResult[];
  derivedLocation?: DerivedLocation;
};

const cache = new Map<string, CacheEntry>();

function buildViewbox(lat: number, lon: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111_000;
  const lonDelta = radiusMeters / (111_000 * Math.cos((lat * Math.PI) / 180));
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLon = lon - lonDelta;
  const maxLon = lon + lonDelta;
  return `${minLon},${minLat},${maxLon},${maxLat}`;
}

async function reverseGeocodeCoordinates(lat: number, lon: number) {
  try {
    const params = new URLSearchParams({
      format: 'json',
      addressdetails: '1',
      lat: String(lat),
      lon: String(lon),
    });
    const response = await fetch(`${REVERSE_NOMINATIM_URL}?${params.toString()}`, {
      headers: {
        'User-Agent': 'VerityProtect/1.0 (support@verityprotect.com)',
      },
    });
    if (!response.ok) {
      logger.warn(`Reverse geocode failed (${response.status}) for lat=${lat}, lon=${lon}`);
      return null;
    }
    const raw = (await response.json()) as any;
    const address = (raw.address ?? {}) as Record<string, string>;
    const postalCode = address.postcode?.trim();
    const city = (address.city || address.town || address.village)?.trim();
    const state = address.state?.trim();
    const displayLabel = postalCode || (city && state ? `${city}, ${state}` : city ?? state);
    return {
      postalCode,
      city,
      state,
      displayLabel,
    };
  } catch (error) {
    const err = error as Error;
    logger.warn(`Reverse geocode error for lat=${lat}, lon=${lon} message=${err.message}`);
    return null;
  }
}

async function fetchProviders(options: LookupOptions): Promise<ProfessionalLookupResponse> {
  const { query, limit = 5, lat, lon, radiusMeters = 5_000 } = options;
  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    extratags: '1',
    limit: String(limit),
  });
  const normalizedQuery = query?.trim();
  const hasCoordinates = lat !== undefined && lon !== undefined;
  const shouldAutoQuery = !normalizedQuery && hasCoordinates;
  let derivedLocation: DerivedLocation | undefined;
  let locationParts: string | undefined;
  if (shouldAutoQuery && lat !== undefined && lon !== undefined) {
    const reverseResult = await reverseGeocodeCoordinates(lat, lon);
    if (reverseResult) {
      derivedLocation = reverseResult;
      locationParts = [reverseResult.postalCode, reverseResult.city, reverseResult.state]
        .filter(Boolean)
        .join(' ');
      if (reverseResult.displayLabel) {
        derivedLocation.displayLabel = reverseResult.displayLabel;
      } else if (locationParts) {
        derivedLocation.displayLabel = locationParts;
      }
    }
  }
  const fallbackQuery = locationParts ? `medical doctor ${locationParts}` : 'healthcare provider';
  const searchQuery = normalizedQuery || (hasCoordinates ? fallbackQuery : undefined);
  if (!searchQuery) {
    return { providers: [], derivedLocation };
  }
  params.set('q', searchQuery);
  if (lat !== undefined && lon !== undefined) {
    params.set('lat', String(lat));
    params.set('lon', String(lon));
    params.set('viewbox', buildViewbox(lat, lon, radiusMeters));
    params.set('bounded', '1');
  }
  const url = `${NOMINATIM_URL}?${params.toString()}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'VerityProtect/1.0 (support@verityprotect.com)',
      },
    });
    if (!response.ok) {
      logger.warn(`Nominatim lookup failed (${response.status}) for query=${searchQuery}`);
      return { providers: [], derivedLocation };
    }
    const raw = (await response.json()) as any[];
    const providers = raw
      .filter((entry) => typeof entry === 'object' && entry !== null)
      .map((entry) => {
        const address = (entry.address ?? {}) as Record<string, string>;
        const displayAddress = [
          entry.display_name,
          address.suburb,
          address.city,
          address.state,
          address.country,
        ]
          .filter(Boolean)
          .join(', ');
        const phones: string[] = [];
        if (entry.extratags?.phone) {
          phones.push(entry.extratags.phone);
        }
        if (entry.extratags?.fax) {
          phones.push(entry.extratags.fax);
        }
        return {
          name: entry.display_name ?? 'Professional',
          displayAddress,
          phones,
          type: entry.type ?? null,
          category: entry.class ?? null,
          placeId: String(entry.place_id ?? ''),
          latitude: entry.lat ? Number(entry.lat) : undefined,
          longitude: entry.lon ? Number(entry.lon) : undefined,
        };
      });
    return {
      providers,
      derivedLocation,
    };
  } catch (error) {
    logger.err(error as Error);
    return { providers: [], derivedLocation };
  }
}

export async function searchProfessionalDirectory(options: LookupOptions): Promise<ProfessionalLookupResponse> {
  const keyParts = [options.query ?? '', options.lat ?? '', options.lon ?? '', options.radiusMeters ?? '', options.limit ?? ''];
  const key = keyParts.join('::');
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const data = await fetchProviders(options);
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}
