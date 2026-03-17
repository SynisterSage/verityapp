import logger from 'jet-logger';

import supabaseAdmin from '@src/services/supabase';
import { createFacilityOfferClaimToken, normalizeFacilityCode } from '@src/services/facilityOffers';

function readFlag(flag: string) {
  const index = process.argv.findIndex((value) => value === flag);
  if (index < 0) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function main() {
  const codeFlag = readFlag('--code');
  if (!codeFlag?.trim()) {
    throw new Error('Missing required flag: --code');
  }

  const code = normalizeFacilityCode(codeFlag);
  if (!code) {
    throw new Error('Facility code is invalid');
  }

  const websiteBaseUrl = (process.env.FACILITY_OFFER_WEBSITE_URL ?? 'https://www.verityprotect.com').replace(
    /\/+$/,
    ''
  );

  const { data, error } = await supabaseAdmin
    .from('facility_codes')
    .select('code, facilities:facility_id ( name, slug )')
    .eq('code', code)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(`Facility code ${code} was not found`);
  }

  const facilities = data.facilities as { name?: string | null; slug?: string | null } | { name?: string | null; slug?: string | null }[] | null;
  const facility = Array.isArray(facilities) ? facilities[0] : facilities;
  const facilitySlug = facility?.slug?.trim() || toSlug(facility?.name ?? code.toLowerCase());

  const claimToken = createFacilityOfferClaimToken({
    code,
    facilitySlug,
  });

  const claimUrl = `${websiteBaseUrl}/f/${facilitySlug}?t=${encodeURIComponent(claimToken)}`;
  logger.info(`Facility claim link for ${code}: ${claimUrl}`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.err(error as Error);
    process.exitCode = 1;
  });
}
