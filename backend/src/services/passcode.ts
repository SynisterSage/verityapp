import crypto from 'crypto';

export function hashPasscode(pin: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasscodeHash(pin: string, stored?: string | null) {
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
