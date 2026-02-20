export const CURRENT_TERMS_VERSION = process.env.LEGAL_TERMS_VERSION ?? '2026-02-20';
export const CURRENT_PRIVACY_VERSION = process.env.LEGAL_PRIVACY_VERSION ?? '2026-02-20';

export const TERMS_URL = process.env.LEGAL_TERMS_URL ?? 'https://verityprotect.com/terms';
export const PRIVACY_URL = process.env.LEGAL_PRIVACY_URL ?? 'https://verityprotect.com/privacy';

export const CURRENT_LEGAL_VERSIONS = {
  termsVersion: CURRENT_TERMS_VERSION,
  privacyVersion: CURRENT_PRIVACY_VERSION,
  termsUrl: TERMS_URL,
  privacyUrl: PRIVACY_URL,
} as const;

