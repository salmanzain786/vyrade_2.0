/**
 * Encryption for platform OAuth tokens at rest (Work Intelligence, Phase 1.1).
 * AES-256-GCM with a key derived from WORK_INTEL_KEY (or AUTH_SECRET as a
 * fallback, which is already required for the app to run). Access/refresh tokens
 * for a connected task platform must never be stored in plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

function key() {
  const raw = process.env.WORK_INTEL_KEY || process.env.AUTH_SECRET;
  if (!raw) throw new Error('WORK_INTEL_KEY or AUTH_SECRET must be set to encrypt connection tokens');
  return createHash('sha256').update(String(raw)).digest(); // 32 bytes
}

/** → "iv:tag:ciphertext" (all base64), or null for empty input. */
export function encryptToken(plain) {
  if (plain == null || plain === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/** Inverse of encryptToken. Returns null on missing/tampered input. */
export function decryptToken(blob) {
  if (!blob) return null;
  const parts = String(blob).split(':');
  if (parts.length !== 3) return null;
  try {
    const [ivB, tagB, dataB] = parts;
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null; // tampered / wrong key
  }
}

export default { encryptToken, decryptToken };
