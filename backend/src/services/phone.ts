import { parsePhoneNumberFromString } from 'libphonenumber-js';

const HIGH_RISK_COUNTRY_CODES = new Set([
  'IN', // India
  'MX', // Mexico
  'DO', // Dominican Republic
  'JM', // Jamaica
  'BR', // Brazil
  'NG', // Nigeria
  'GH', // Ghana
  'TR', // Turkey (common spoof)
  'UA', // Ukraine
  'RU', // Russia
]);

export type CallerMetadata = {
  normalized?: string;
  country?: string | null;
  region?: string | null;
  isHighRiskCountry?: boolean;
};

/**
 * Normalize and classify a caller number using libphonenumber-js.
 */
export function getCallerMetadata(rawNumber?: string | null): CallerMetadata {
  if (!rawNumber) {
    return {};
  }
  try {
    const phoneNumber = parsePhoneNumberFromString(rawNumber, 'US');
    if (!phoneNumber) {
      return {};
    }
    const { country, number, countryCallingCode } = phoneNumber;
    const isHighRisk = country ? HIGH_RISK_COUNTRY_CODES.has(country) : false;
    return {
      normalized: number,
      country: country ?? null,
      region: countryCallingCode ? `+${countryCallingCode}` : null,
      isHighRiskCountry: isHighRisk,
    };
  } catch {
    return {};
  }
}
