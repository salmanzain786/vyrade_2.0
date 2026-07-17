import { randomInt, createHmac, timingSafeEqual } from 'crypto';
import { authSecret } from './secret.js';

// One-time passcodes for email verification and password reset. Codes are
// 6 digits and are NEVER stored — only a keyed hash.
//
// Why HMAC and not plain SHA-256: a 6-digit code has only 1,000,000 possible
// values, so an unsalted SHA-256 of it is trivially reversed with a rainbow
// table if the database leaks. HMAC keys the digest with AUTH_SECRET, which
// lives outside the database — so a DB-only leak reveals nothing.

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp() {
  // randomInt is uniform and crypto-strong; pad so leading zeros survive.
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Keyed hash of a code. Hex, 64 chars — same width as the old SHA-256 column. */
export function hashOtp(code) {
  return createHmac('sha256', authSecret()).update(String(code)).digest('hex');
}

/** Constant-time comparison of a stored hash against a submitted code. */
export function otpMatches(storedHashHex, submittedCode) {
  if (typeof storedHashHex !== 'string' || storedHashHex.length === 0) return false;
  const a = Buffer.from(storedHashHex, 'hex');
  const b = Buffer.from(hashOtp(submittedCode), 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function otpExpiry(now = Date.now()) {
  return new Date(now + OTP_TTL_MINUTES * 60 * 1000);
}
