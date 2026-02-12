import fetch from 'node-fetch';
import logger from 'jet-logger';

const NPI_API_URL = 'https://npiregistry.cms.hhs.gov/api';
const CACHE_TTL_MS = 5 * 60 * 1000;

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
  name?: string;
  limit?: number;
  offset?: number;
};

type NameMode = 'none' | 'organization' | 'person';

type CacheEntry = {
  expiresAt: number;
  data: ProfessionalLookupResponse;
};

export type ProfessionalLookupResponse = {
  providers: ProfessionalLookupResult[];
  totalResults: number;
};

const cache = new Map<string, CacheEntry>();

const STATE_MAP: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN',
  iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY',
};

function titleCase(input?: string) {
  if (!input) return input;
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parseLocationText(text: string) {
  if (!text) {
    return {};
  }
  const normalized = text.replace(/\s+/g, ' ').trim();
  const postalMatch = normalized.match(/\b(\d{5})(?:-\d{4})?\b/);

  const stateMatch = normalized.match(/(?:,|\s)([A-Za-z]{2})$/);
  const fullStateMatch = normalized.match(/,\s*([A-Za-z\s]+)$/);
  let state: string | undefined;
  if (stateMatch) {
    state = stateMatch[1].toUpperCase();
  } else if (fullStateMatch) {
    const key = fullStateMatch[1].trim().toLowerCase();
    state = STATE_MAP[key];
  }

  const cleaned = normalized
    .replace(/,\s*([A-Za-z]{2})$/, '')
    .replace(/,\s*[A-Za-z\s]+$/, '')
    .replace(/\s+[A-Za-z]{2}$/, '')
    .trim();

  const parts = cleaned.split(',').map((p) => p.trim()).filter(Boolean);
  let city: string | undefined;
  if (parts.length > 0) {
    const firstPart = parts[0];
    const isNumericOnly = /^\d+$/.test(firstPart);
    city = !isNumericOnly ? titleCase(firstPart) : undefined;
  } else if (!postalMatch) {
    const isNumericOnly = /^\d+$/.test(cleaned);
    city = !isNumericOnly ? titleCase(cleaned) : undefined;
  }

  return {
    postalCode: postalMatch ? postalMatch[1] : undefined,
    city,
    state,
  };
}

async function fetchProviders(options: LookupOptions): Promise<ProfessionalLookupResponse> {
  const { query, name, limit = 10, offset = 0 } = options;
  const normalizedQuery = query?.trim();
  if (!normalizedQuery) {
    return { providers: [], totalResults: 0 };
  }
  const locationParams = parseLocationText(normalizedQuery);
  if (!locationParams.postalCode && !locationParams.city) {
    logger.warn(`Lookup skipped because query did not contain location info: ${normalizedQuery}`);
    return { providers: [], totalResults: 0 };
  }
  const trimmedName = name?.trim() ?? '';
  const nameParts = trimmedName ? trimmedName.split(/\s+/) : [];
  const buildSearchParams = (mode: NameMode, requestLimit: number) => {
    const params = new URLSearchParams({
      version: '2.1',
      limit: String(Math.min(requestLimit, 1000)),
      address_purpose: 'LOCATION',
      country_code: 'US',
    });
    if (offset > 0) {
      params.set('skip', String(offset));
    }
    if (locationParams.postalCode) {
      params.set('postal_code', locationParams.postalCode);
    }
    if (locationParams.city) {
      params.set('city', locationParams.city);
    }
    if (locationParams.state) {
      params.set('state', locationParams.state);
    }
    if (mode === 'organization' && trimmedName) {
      params.set('organization_name', trimmedName);
    }
    if (mode === 'person' && nameParts.length >= 2) {
      params.set('first_name', nameParts[0]);
      params.set('last_name', nameParts.slice(1).join(' '));
    }
    return params;
  };

  const fetchAttempt = async (mode: NameMode, requestLimit = limit) => {
    const url = `${NPI_API_URL}?${buildSearchParams(mode, requestLimit).toString()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'VerityProtect/1.0 (support@verityprotect.com)',
      },
    });
    if (!response.ok) {
      logger.warn(`NPI lookup failed (${response.status}) mode=${mode} url=${url}`);
      return { body: { results: [], result_count: 0 } as { result_count?: number; results?: any[] }, url };
    }
    const body = (await response.json()) as { result_count?: number; results?: any[] };
    if (!body.results || body.results.length === 0) {
      logger.info(`NPI lookup returned 0 results mode=${mode} url=${url}`);
    }
    return { body, url };
  };

  try {
    const candidateModes: NameMode[] = trimmedName
      ? (nameParts.length >= 2 ? ['organization', 'person', 'none'] : ['organization', 'none'])
      : ['none'];

    let selectedBody: { result_count?: number; results?: any[] } = { results: [], result_count: 0 };
    let selectedMode: NameMode = candidateModes[0] ?? 'none';
    for (const mode of candidateModes) {
      const requestLimit = mode === 'none' && trimmedName ? Math.max(limit * 5, 50) : limit;
      const { body } = await fetchAttempt(mode, requestLimit);
      if ((body.results ?? []).length > 0) {
        selectedBody = body;
        selectedMode = mode;
        break;
      }
      selectedBody = body;
      selectedMode = mode;
    }

    let entries = selectedBody.results ?? [];
    if (trimmedName && entries.length > 0 && selectedMode === 'none') {
      const needle = trimmedName.toLowerCase();
      entries = entries.filter((entry) => {
        const basic = entry.basic ?? {};
        const addresses = Array.isArray(entry.addresses) ? entry.addresses : [];
        const locationAddress = addresses.find((addr: any) => addr.address_purpose === 'LOCATION') ?? addresses[0] ?? {};
        const personName = [basic.first_name, basic.middle_name, basic.last_name].filter(Boolean).join(' ').toLowerCase();
        const orgName = String(basic.organization_name ?? '').toLowerCase();
        const address = String(locationAddress.address_1 ?? '').toLowerCase();
        return orgName.includes(needle) || personName.includes(needle) || address.includes(needle);
      });
      entries = entries.slice(0, limit);
    }

    const providers = entries
      .filter((entry) => entry)
      .map((entry) => {
        const basic = entry.basic ?? {};
        const addresses = Array.isArray(entry.addresses) ? entry.addresses : [];
        const locationAddress = addresses.find((addr: any) => addr.address_purpose === 'LOCATION') ?? addresses[0] ?? {};
        const phones: string[] = [];
        if (locationAddress.telephone_number) {
          phones.push(locationAddress.telephone_number);
        }
        const displayAddress = [
          locationAddress.address_1,
          locationAddress.address_2,
          locationAddress.city,
          locationAddress.state,
          locationAddress.postal_code,
        ]
          .filter(Boolean)
          .join(', ');
        const taxonomy = Array.isArray(entry.taxonomies) ? entry.taxonomies[0] : null;
        const nameParts = [basic.organization_name, [basic.first_name, basic.middle_name, basic.last_name].filter(Boolean).join(' ').trim()]
          .filter(Boolean);
        return {
          name: nameParts[0] ?? 'Professional',
          displayAddress,
          phones,
          type: taxonomy?.code ?? null,
          category: taxonomy?.desc ?? null,
          placeId: entry.number ?? `${basic.first_name}_${basic.last_name}_${locationAddress.postal_code ?? 'unknown'}`,
          latitude: undefined,
          longitude: undefined,
        };
      });
    return {
      providers,
      totalResults: selectedBody.result_count ?? providers.length,
    };
  } catch (error) {
    logger.err(error as Error);
    return { providers: [], totalResults: 0 };
  }
}

export async function searchProfessionalDirectory(options: LookupOptions): Promise<ProfessionalLookupResponse> {
  const keyParts = [options.query ?? '', options.name ?? '', options.limit ?? '', options.offset ?? ''];
  const key = keyParts.join('::');
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const data = await fetchProviders(options);
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}
