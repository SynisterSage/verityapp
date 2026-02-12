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

export type ProfessionalLookupResponse = {
  providers: ProfessionalLookupResult[];
  totalResults: number;
};

export async function lookupProviders(profileId: string, params: { query?: string; limit?: number; offset?: number; }): Promise<ProfessionalLookupResponse> {
  const searchParams = new URLSearchParams();
  if (params.query) {
    searchParams.set('q', params.query);
  }
  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }
  if (params.offset) {
    searchParams.set('offset', String(params.offset));
  }
  const res = (await authorizedFetch(`/profiles/${profileId}/professional-lookup?${searchParams.toString()}`)) as {
    providers?: ProfessionalLookupResult[];
    totalResults?: number;
  } | null;
  return {
    providers: res?.providers ?? [],
    totalResults: res?.totalResults ?? 0,
  };
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
