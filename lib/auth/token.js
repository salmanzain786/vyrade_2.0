import { createHmac, timingSafeEqual } from 'crypto';
import { authSecret as secret } from './secret.js';

// Stateless signed tokens (HMAC-SHA256) used for the session cookie and the
// short-lived password-reset token. Format: base64url(payload).base64url(sig).
// No external JWT dependency — Node crypto is enough for an HMAC token.

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (str) =>
  Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(payloadB64) {
  return b64url(createHmac('sha256', secret()).update(payloadB64).digest());
}

/**
 * Create a signed token. `data` is any JSON-serializable object; `ttlSeconds`
 * sets its expiry. An `exp` (unix seconds) claim is added automatically.
 */
export function createToken(data, ttlSeconds) {
  const payload = { ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verify a token's signature and expiry. Returns the payload object, or null
 * if the token is malformed, tampered, or expired.
 */
export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;

  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
