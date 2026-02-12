import { authorizedFetch } from './backend';

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

export type TrustedProfessional = {
  id: string;
  caller_number: string | null;
  contact_name: string | null;
  relationship_tag: string | null;
  source: string;
  caller_hash: string | null;
};

export async function lookupProviders(profileId: string, params: { query?: string; lat?: number; lon?: number; radius?: number; limit?: number; }) {
  const searchParams = new URLSearchParams();
  if (params.query) {
    searchParams.set('q', params.query);
  }
  if (params.lat) {
    searchParams.set('lat', String(params.lat));
  }
  if (params.lon) {
    searchParams.set('lon', String(params.lon));
  }
  if (params.radius) {
    searchParams.set('radius', String(params.radius));
  }
  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }
  const res = await authorizedFetch(`/profiles/${profileId}/professional-lookup?${searchParams.toString()}`);
  return res?.providers as ProfessionalLookupResult[] | [];
}

export async function listTrustedProfessionals(profileId: string) {
  const res = await authorizedFetch(`/fraud/trusted-contacts?profileId=${profileId}`);
  if (!res?.trusted_contacts) {
    return [] as TrustedProfessional[];
  }
  return (res.trusted_contacts as TrustedProfessional[]).filter((contact) => contact.source === 'professional_lookup');
}

export async function addTrustedProfessional(profileId: string, provider: ProfessionalLookupResult) {
  const payload = {
    profileId,
    callerNumbers: provider.phones,
    source: 'professional_lookup',
    contactNames: provider.phones.reduce<Record<string, string>>((acc, phone) => {
      if (phone) {
        acc[phone] = provider.name;
      }
      return acc;
    }, {}),
    relationship_tag: provider.category ?? 'Professional',
  };
  return authorizedFetch('/fraud/trusted-contacts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function removeTrustedProfessional(trustedId: string) {
  return authorizedFetch(`/fraud/trusted-contacts/${trustedId}`, {
    method: 'DELETE',
  });
}
