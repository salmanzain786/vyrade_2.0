import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

// Password hashing with Node's built-in scrypt — no native dependency to
// compile on Windows. Stored form is `salt:derivedKey`, both hex.

const scrypt = promisify(_scrypt);
const KEYLEN = 64;

export async function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(plain, salt, KEYLEN);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, keyHex] = stored.split(':');
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derived = await scrypt(plain, salt, KEYLEN);
  // Length guard first — timingSafeEqual throws on mismatched lengths.
  if (keyBuf.length !== derived.length) return false;
  return timingSafeEqual(keyBuf, derived);
}
