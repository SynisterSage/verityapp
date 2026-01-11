import crypto from 'crypto';
import argon2 from 'argon2';

const CURRENT_PEPPER_VERSION = Number(process.env.PIN_PEPPER_VERSION ?? '1');
const PIN_PEPPER_KEY = `PIN_PEPPER`;

function resolvePepper(version: number) {
  if (!Number.isFinite(version) || version <= 0) {
    version = CURRENT_PEPPER_VERSION;
  }
  if (version === CURRENT_PEPPER_VERSION) {
    return process.env[PIN_PEPPER_KEY] ?? '';
  }
  return process.env[`PIN_PEPPER_V${version}`] ?? '';
}

function ensurePepper(version: number) {
  const pepper = resolvePepper(version);
  if (!pepper) {
    throw new Error(`PIN pepper for version ${version} is not configured`);
  }
  return pepper;
}

export interface HashedPasscode {
  hash: string;
  salt: string; // hex literal prefixed with \x
  pepperVersion: number;
}

export async function hashPasscode(pin: string): Promise<HashedPasscode> {
  const pepperVersion = CURRENT_PEPPER_VERSION;
  const saltBytes = crypto.randomBytes(24);
  const saltHex = saltBytes.toString('hex');
  const pepper = ensurePepper(pepperVersion);
  const payload = `${pin}${pepper}`;
  const hash = await argon2.hash(payload, {
    type: argon2.argon2id,
    memoryCost: 64 * 1024,
    timeCost: 3,
    parallelism: 1,
    salt: saltBytes,
  });
  return {
    hash,
    salt: `\\x${saltHex}`,
    pepperVersion,
  };
}

export async function verifyCurrentPasscode(
  pin: string,
  hash?: string | null,
  version?: number
) {
  if (!pin || !hash || !version) {
    return false;
  }
  const pepper = resolvePepper(version);
  if (!pepper) {
    return false;
  }

  const payload = `${pin}${pepper}`;
  try {
    return await argon2.verify(hash, payload);
  } catch {
    return false;
  }
}

export function verifyLegacyPasscode(pin: string, stored?: string | null) {
  if (!pin || !stored) {
    return false;
  }
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) {
    return false;
  }
  const derived = crypto.scryptSync(pin, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

export { CURRENT_PEPPER_VERSION };
