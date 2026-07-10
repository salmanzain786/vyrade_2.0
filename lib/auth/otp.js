import { randomInt, createHash } from 'crypto';

// One-time passcodes for email verification and password reset. Codes are
// 6 digits, delivered to the user, and only ever stored as a SHA-256 hash.

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp() {
  // randomInt is uniform and crypto-strong; pad so leading zeros survive.
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(code) {
  return createHash('sha256').update(String(code)).digest('hex');
}

export function otpExpiry(now = Date.now()) {
  return new Date(now + OTP_TTL_MINUTES * 60 * 1000);
}
