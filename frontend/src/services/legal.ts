import { getPublicEnv } from './publicConfig';

export type LegalVersions = {
  termsVersion: string;
  privacyVersion: string;
  termsUrl: string;
  privacyUrl: string;
};

export const FALLBACK_LEGAL_VERSIONS: LegalVersions = {
  termsVersion: '2026-02-20',
  privacyVersion: '2026-02-20',
  termsUrl: 'https://www.verityprotect.com/terms',
  privacyUrl: 'https://www.verityprotect.com/privacy',
};

function getBaseUrl() {
  return getPublicEnv('EXPO_PUBLIC_API_URL') || getPublicEnv('EXPO_PUBLIC_API_BASE_URL');
}

function isValidLegalVersions(payload: unknown): payload is LegalVersions {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const data = payload as Record<string, unknown>;
  return (
    typeof data.termsVersion === 'string' &&
    typeof data.privacyVersion === 'string' &&
    typeof data.termsUrl === 'string' &&
    typeof data.privacyUrl === 'string'
  );
}

export async function fetchCurrentLegalVersions(): Promise<LegalVersions> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return FALLBACK_LEGAL_VERSIONS;
  }

  try {
    const response = await fetch(`${baseUrl}/auth/legal-versions`);
    if (!response.ok) {
      return FALLBACK_LEGAL_VERSIONS;
    }
    const body = await response.json().catch(() => null);
    if (!isValidLegalVersions(body)) {
      return FALLBACK_LEGAL_VERSIONS;
    }
    return body;
  } catch {
    return FALLBACK_LEGAL_VERSIONS;
  }
}
