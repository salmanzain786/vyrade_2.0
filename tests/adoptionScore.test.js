import { describe, it, expect } from 'vitest';
import { computeAdoptionScore, bandFor, WEIGHTS } from '../lib/services/adoption/adoptionScore.js';
import { opportunitiesForProfile, departmentFor } from '../lib/services/adoption/catalog.js';

describe('adoption score (1.4)', () => {
  it('weights sum to 1.0 (a clean, documented blend)', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('an empty profile scores 0 and reads "Exploring"', () => {
    const r = computeAdoptionScore({});
    expect(r.score).toBe(0);
    expect(r.band).toBe('exploring');
  });

  it('a fully-engaged user approaches 100 and reads "Leading"', () => {
    const all = Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 1]));
    const r = computeAdoptionScore(all);
    expect(r.score).toBe(100);
    expect(r.band).toBe('leading');
  });

  it('is directional — carries an explicit not-a-measurement caveat', () => {
    expect(computeAdoptionScore({}).caveat).toMatch(/directional|not a precise/i);
  });

  it('breakdown contributions sum to the score (transparent, no black box)', () => {
    const signals = { blueprints_completed: 0.5, governance_completion: 1, skills_readiness: 0.6 };
    const r = computeAdoptionScore(signals);
    const summed = r.breakdown.reduce((a, b) => a + b.contribution, 0);
    expect(Math.abs(summed - r.score)).toBeLessThanOrEqual(1); // rounding tolerance
  });

  it('clamps out-of-range signals', () => {
    expect(computeAdoptionScore({ blueprints_completed: 5 }).score).toBe(Math.round(WEIGHTS.blueprints_completed * 100));
    expect(bandFor(-10).key).toBe('exploring');
  });
});

describe('opportunity catalog (1.2)', () => {
  it('maps a free-text role to a department', () => {
    expect(departmentFor({ role: 'Marketing Manager' })).toBe('marketing');
    expect(departmentFor({ role: 'Head of Finance' })).toBe('finance');
    expect(departmentFor({ department: 'support' })).toBe('support');
    expect(departmentFor({ role: 'Wizard' })).toBe('general');
  });

  it('produces a deterministic, deduped area list including cross-functional areas', () => {
    const areas = opportunitiesForProfile({ department: 'marketing' });
    const keys = areas.map((a) => a.key);
    expect(keys).toContain('mkt_lead_capture');
    expect(keys).toContain('gen_notifications');           // general areas always included
    expect(new Set(keys).size).toBe(keys.length);          // no duplicates
    // deterministic: same input → same output
    expect(opportunitiesForProfile({ department: 'marketing' }).map((a) => a.key)).toEqual(keys);
  });

  it('every area carries an ESTIMATED hours figure and a complexity', () => {
    for (const a of opportunitiesForProfile({ department: 'finance' })) {
      expect(typeof a.est_hours_month).toBe('number');
      expect(['no_code', 'low_code', 'api']).toContain(a.complexity);
    }
  });
});
