import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { generateOtp, hashOtp, otpMatches, OTP_TTL_MINUTES, otpExpiry } from '../lib/auth/otp.js';
import { POLICIES, clientIp, RateLimitError } from '../lib/auth/rateLimit.js';

describe('P1 — OTP hashing is keyed, not plain SHA-256', () => {
  it('is NOT an unsalted SHA-256 of the code (which is trivially reversed for 6 digits)', () => {
    const code = '123456';
    const plain = createHash('sha256').update(code).digest('hex');
    expect(hashOtp(code)).not.toBe(plain);
  });

  it('is keyed by AUTH_SECRET — the same code hashes differently under another secret', () => {
    const code = '123456';
    const withA = hashOtp(code);
    const prev = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'a-completely-different-secret-value';
    const withB = hashOtp(code);
    process.env.AUTH_SECRET = prev;
    expect(withA).not.toBe(withB);
  });

  it('is deterministic and hex-64 (fits the existing column)', () => {
    expect(hashOtp('000000')).toBe(hashOtp('000000'));
    expect(hashOtp('000000')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('otpMatches accepts the right code and rejects everything else', () => {
    const stored = hashOtp('654321');
    expect(otpMatches(stored, '654321')).toBe(true);
    expect(otpMatches(stored, '654322')).toBe(false);
    expect(otpMatches(stored, '')).toBe(false);
    expect(otpMatches('', '654321')).toBe(false);
    expect(otpMatches(null, '654321')).toBe(false);
  });

  it('generates zero-padded 6-digit codes', () => {
    for (let i = 0; i < 200; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it('expires in 10 minutes', () => {
    const now = Date.now();
    expect(otpExpiry(now).getTime()).toBe(now + OTP_TTL_MINUTES * 60 * 1000);
  });
});

describe('P1 — rate-limit policy', () => {
  it('covers every auth event', () => {
    for (const e of ['login', 'register', 'resend_otp', 'forgot_password', 'verify_email', 'verify_reset_otp', 'reset_password']) {
      expect(POLICIES[e], `no policy for ${e}`).toBeTruthy();
      expect(POLICIES[e].ip.max).toBeGreaterThan(0);
    }
  });

  it('caps password-reset requests at 3/hour and enforces a resend cooldown', () => {
    expect(POLICIES.forgot_password.email).toEqual({ max: 3, windowMin: 60 });
    expect(POLICIES.forgot_password.cooldownSec).toBe(60);
    expect(POLICIES.resend_otp.cooldownSec).toBe(60);
  });

  it('RateLimitError is a 429 carrying Retry-After', () => {
    const e = new RateLimitError('slow down', 42);
    expect(e.statusCode).toBe(429);
    expect(e.retryAfter).toBe(42);
  });

  it('clientIp returns unknown when there is no trusted source', () => {
    expect(clientIp({ headers: { get: () => null } })).toBe('unknown');
  });
});
