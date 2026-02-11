import fetch from 'node-fetch';
import logger from 'jet-logger';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  data: ProfessionalLookupResult[];
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

async function fetchProviders(options: LookupOptions) {
  const { query, limit = 5, lat, lon, radiusMeters = 5_000 } = options;
  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    extratags: '1',
    limit: String(limit),
  });
  if (query) {
    params.set('q', query);
  }
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
      logger.warn(`Nominatim lookup failed (${response.status}) for query=${query}`);
      return [];
    }
    const raw = (await response.json()) as any[];
    return raw
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
  } catch (error) {
    logger.err(error as Error);
    return [];
  }
}

export async function searchProfessionalDirectory(options: LookupOptions) {
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
