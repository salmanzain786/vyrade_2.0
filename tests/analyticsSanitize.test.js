import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeProps, errorCategory, ALLOWED_PROPERTIES } from '../lib/analytics/sanitize.js';

describe('sanitizeProps — strict allowlist', () => {
  it('keeps only allowlisted keys', () => {
    const out = sanitizeProps({ blueprint_id: 'bp_1', node_count: 5, secret_field: 'nope', email: 'a@b.com' });
    expect(out).toEqual({ blueprint_id: 'bp_1', node_count: 5 });
    expect(out).not.toHaveProperty('secret_field');
    expect(out).not.toHaveProperty('email');
  });

  it('drops objects and arrays (no blueprint / workflow payloads)', () => {
    const out = sanitizeProps({ blueprint_id: { name: 'x', systems: [1, 2] }, status: ['a'] });
    expect(out).toEqual({}); // both values are non-primitive → dropped
  });

  it('drops values that look like emails, URLs or connection strings — even on an allowlisted key', () => {
    expect(sanitizeProps({ model: 'user@example.com' })).toEqual({});
    expect(sanitizeProps({ source: 'https://evil.com/leak' })).toEqual({});
    expect(sanitizeProps({ context: 'mysql://user:pass@host/db' })).toEqual({});
  });

  it('drops over-long strings (no text blobs / raw messages)', () => {
    expect(sanitizeProps({ status: 'x'.repeat(300) })).toEqual({});
  });

  it('keeps safe primitives (number / boolean / short string)', () => {
    const out = sanitizeProps({ cost_usd: 0.12, rate_limited: true, platform: 'zapier', total_tokens: 0 });
    expect(out).toEqual({ cost_usd: 0.12, rate_limited: true, platform: 'zapier', total_tokens: 0 });
  });

  it('the allowlist contains no obviously-sensitive keys', () => {
    for (const banned of ['email', 'name', 'password', 'workflow', 'blueprint_json', 'reason', 'error', 'message', 'ip']) {
      expect(ALLOWED_PROPERTIES.has(banned)).toBe(false);
    }
  });
});

describe('errorCategory — coarse, non-sensitive', () => {
  it('maps status codes to categories', () => {
    expect(errorCategory(429)).toBe('rate_limited');
    expect(errorCategory(403)).toBe('forbidden');
    expect(errorCategory(401)).toBe('unauthorized');
    expect(errorCategory(500)).toBe('server_error');
    expect(errorCategory(undefined)).toBe('error');
  });
});

// ── Server: distinct_id is pseudonymized, never raw email ───────────────────
const track = vi.fn();
const peopleSet = vi.fn();
vi.mock('mixpanel', () => ({
  default: { init: () => ({ track: (...a) => track(...a), people: { set: (...a) => peopleSet(...a) } }) },
}));

// The server module needs a token to emit, and a secret to HMAC.
process.env.MIXPANEL_TOKEN = 'test_token';
process.env.AUTH_SECRET = 'x'.repeat(32);
const server = await import('../lib/analytics/server.js');

describe('trackServer — pre-auth identity is HMAC-pseudonymized', () => {
  beforeEach(() => { track.mockReset(); peopleSet.mockReset(); });

  it('never sends the raw email as distinct_id or as a property', () => {
    server.trackServer('Login Failed', {
      email: 'victim@example.com',
      status_code: 401, error_category: 'unauthorized', rate_limited: false,
      reason: 'invalid password for victim@example.com', // must be dropped
    });
    expect(track).toHaveBeenCalledTimes(1);
    const [event, payload] = track.mock.calls[0];
    expect(event).toBe('Login Failed');
    // distinct_id is an anon hash, not the email.
    expect(payload.distinct_id).toMatch(/^anon_[a-f0-9]{24}$/);
    expect(payload.distinct_id).not.toContain('victim');
    // No email / raw reason anywhere in the payload.
    expect(JSON.stringify(payload)).not.toContain('victim@example.com');
    expect(payload).not.toHaveProperty('reason');
    expect(payload).not.toHaveProperty('email');
    // Allowlisted fields survive.
    expect(payload.status_code).toBe(401);
    expect(payload.error_category).toBe('unauthorized');
  });

  it('same email → same anon id (funnel still stitches)', () => {
    server.trackServer('Password Reset Requested', { email: 'a@b.com' });
    server.trackServer('OTP Resent', { email: 'a@b.com' });
    expect(track.mock.calls[0][1].distinct_id).toBe(track.mock.calls[1][1].distinct_id);
  });

  it('signed-in events use the raw user id', () => {
    server.trackServer('Workflow Generated', { userId: 'user-123', node_count: 7 });
    expect(track.mock.calls[0][1].distinct_id).toBe('user-123');
    expect(track.mock.calls[0][1].node_count).toBe(7);
  });

  it('setPerson omits $email/$name unless ANALYTICS_ALLOW_PII is set', () => {
    server.setPerson('user-123', { email_verified: true, $email: 'a@b.com', $name: 'Alice' });
    const props = peopleSet.mock.calls[0][1];
    expect(props.email_verified).toBe(true);
    expect(props).not.toHaveProperty('$email');   // PII gated off by default
    expect(props).not.toHaveProperty('$name');
  });
});
