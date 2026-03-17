import { authorizedFetch } from './backend';

export type FacilityOfferValidationResponse = {
  eligible: boolean;
  productId: string;
  code: string;
  facility: {
    id: string;
    name: string;
  };
  offer: {
    trialDays: number;
    annualPriceLabel: string;
  };
};

export async function validateFacilityOfferCode(code: string) {
  return authorizedFetch('/subscriptions/facility-offer/validate', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }) as Promise<FacilityOfferValidationResponse>;
}

export type FacilityOfferTokenResolutionResponse = FacilityOfferValidationResponse & {
  token: string;
  facility: FacilityOfferValidationResponse['facility'] & {
    slug?: string | null;
  };
};

export async function resolveFacilityOfferToken(token: string) {
  return authorizedFetch(
    `/subscriptions/facility-offer/resolve-token?t=${encodeURIComponent(token)}`,
    {
      method: 'GET',
    }
  ) as Promise<FacilityOfferTokenResolutionResponse>;
}
