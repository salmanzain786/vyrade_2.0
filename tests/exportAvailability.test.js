import { describe, it, expect } from 'vitest';
import { assertPlatformAvailable, PlatformUnavailableError } from '../lib/services/exportService.js';

// P1 — the UI and the API must agree. A platform shown as "Coming soon" must not
// quietly produce a guide when the API is called directly.
describe('platform availability rule', () => {
  const call = (readiness, allowGeneric) =>
    () => assertPlatformAvailable({ platform: 'zapier', name: 'Zapier', readiness, allowGeneric });

  it('a configured platform (guide) exports', () => {
    expect(call('guide', false)).not.toThrow();
  });

  it('a full-export platform exports', () => {
    expect(call('full', false)).not.toThrow();
  });

  it('coming_soon is REFUSED with 409 — no silent generic guide', () => {
    expect(call('coming_soon', false)).toThrow(PlatformUnavailableError);
    try { call('coming_soon', false)(); } catch (e) {
      expect(e.statusCode).toBe(409);
      expect(e.message).toMatch(/not available yet/i);
      expect(e.message).toMatch(/allow_generic/);
    }
  });

  it('coming_soon + explicit allow_generic=true is allowed', () => {
    expect(call('coming_soon', true)).not.toThrow();
  });
});
