import logger from 'jet-logger';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import supabaseAdmin from '@src/services/supabase';
import { normalizeFacilityCode } from '@src/services/facilityOffers';

interface Args {
  name: string
  code: string
  slug?: string | null
  maxRedemptions?: number | null
  expiresAt?: string | null
  inactive?: boolean
  notes?: string | null
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function readFlag(flag: string) {
  const index = process.argv.findIndex((value) => value === flag);
  if (index < 0) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function parseArgs(): Args {
  const name = readFlag('--name') ?? '';
  const code = readFlag('--code') ?? '';
  const slug = readFlag('--slug');
  const maxRedemptionsRaw = readFlag('--max-redemptions');
  const expiresAt = readFlag('--expires-at');
  const notes = readFlag('--notes');
  const inactive = process.argv.includes('--inactive');

  if (!name.trim()) {
    throw new Error('Missing required flag: --name');
  }
  if (!code.trim()) {
    throw new Error('Missing required flag: --code');
  }

  const maxRedemptions =
    maxRedemptionsRaw && maxRedemptionsRaw.trim().length > 0
      ? Number.parseInt(maxRedemptionsRaw, 10)
      : null;

  if (maxRedemptionsRaw && !Number.isFinite(maxRedemptions)) {
    throw new Error('--max-redemptions must be an integer');
  }

  return {
    name: name.trim(),
    code: normalizeFacilityCode(code),
    slug: slug?.trim() ?? toSlug(name),
    maxRedemptions,
    expiresAt: expiresAt?.trim() ?? null,
    inactive,
    notes: notes?.trim() ?? null,
  };
}

async function promptArgs(): Promise<Args> {
  const rl = readline.createInterface({ input, output });

  try {
    const name = (await rl.question('Facility name: ')).trim();
    if (!name) {
      throw new Error('Facility name is required');
    }

    const defaultSlug = toSlug(name);
    const slugInput = (await rl.question(`Slug [${defaultSlug}]: `)).trim();

    const rawCode = (await rl.question('Facility code: ')).trim();
    if (!rawCode) {
      throw new Error('Facility code is required');
    }

    const maxRedemptionsInput = (await rl.question('Max redemptions [optional]: ')).trim();
    const expiresAtInput = (await rl.question('Expires at ISO timestamp [optional]: ')).trim();
    const notesInput = (await rl.question('Notes [optional]: ')).trim();
    const inactiveInput = (await rl.question('Mark inactive? (y/N): ')).trim().toLowerCase();

    const maxRedemptions =
      maxRedemptionsInput.length > 0 ? Number.parseInt(maxRedemptionsInput, 10) : null;

    if (maxRedemptionsInput.length > 0 && !Number.isFinite(maxRedemptions)) {
      throw new Error('Max redemptions must be an integer');
    }

    return {
      name,
      code: normalizeFacilityCode(rawCode),
      slug: slugInput || defaultSlug,
      maxRedemptions,
      expiresAt: expiresAtInput || null,
      inactive: inactiveInput === 'y' || inactiveInput === 'yes',
      notes: notesInput || null,
    };
  } finally {
    rl.close();
  }
}

async function main() {
  const hasCliFlags = process.argv.slice(2).length > 0;
  const args = hasCliFlags ? parseArgs() : await promptArgs();

  const response = await supabaseAdmin
    .from('facilities')
    .upsert(
      {
        name: args.name,
        slug: args.slug,
        status: args.inactive ? 'inactive' : 'active',
        notes: args.notes,
      },
      { onConflict: 'slug' }
    )
    .select('id, name, slug')
    .single();

  const facility = response.data as { id: string; name: string; slug: string | null } | null;
  const facilityError = response.error;

  if (facilityError || !facility) {
    throw facilityError ?? new Error('Failed to upsert facility');
  }

  const { error: codeError } = await supabaseAdmin.from('facility_codes').upsert(
    {
      facility_id: facility.id,
      code: args.code,
      is_active: !args.inactive,
      expires_at: args.expiresAt,
      max_redemptions: args.maxRedemptions,
    },
    { onConflict: 'code' }
  );

  if (codeError) {
    throw codeError;
  }

  logger.info(
    `Facility code upserted name="${facility.name}" slug="${facility.slug}" code="${args.code}" active=${String(!args.inactive)}`
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.err(error as Error);
    process.exitCode = 1;
  });
}
