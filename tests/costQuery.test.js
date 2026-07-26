import { describe, it, expect } from 'vitest';
import { baseBlueprint } from './fixtures.js';
import { parseVolumeOverride, parseVersion, MAX_MONTHLY_RUNS } from '../lib/services/cost/costQuery.js';
import { buildCostEstimate } from '../lib/services/cost/costEstimate.js';

const noResolvers = {
  platformPrice: async () => ({ price: null, confidence: 'unknown' }),
  connectorCost: async () => ({ cost: null, confidence: 'unknown' }),
  connectorInfo: async () => ({ found: false }),
};

describe('cost API — volume override validation (point 4)', () => {
  it('accepts a positive integer and floors it', () => {
    expect(parseVolumeOverride('5000')).toEqual({ value: 5000 });
    expect(parseVolumeOverride('1500.9')).toEqual({ value: 1500 });
  });

  it('treats absent/empty as "use the Blueprint volume"', () => {
    expect(parseVolumeOverride(null)).toEqual({ value: null });
    expect(parseVolumeOverride('')).toEqual({ value: null });
  });

  it('REJECTS negative, zero, NaN and over-cap values (no silent ignore)', () => {
    expect(parseVolumeOverride('-5').error).toBeTruthy();
    expect(parseVolumeOverride('0').error).toBeTruthy();
    expect(parseVolumeOverride('abc').error).toBeTruthy();
    expect(parseVolumeOverride(String(MAX_MONTHLY_RUNS + 1)).error).toBeTruthy();
  });

  it('a valid override is surfaced to the user as an explicit assumption', async () => {
    const est = await buildCostEstimate({
      blueprint: baseBlueprint(), platform: 'zapier', monthlyRuns: 5000, resolvers: noResolvers,
    });
    expect(est.monthly_volume).toBe(5000);
    expect(est.volume_assumed).toBe(false);
    expect(est.assumptions.join(' ')).toMatch(/User-provided volume: 5,?000 runs\/month/);
  });
});

describe('cost API — version validation (point 3)', () => {
  it('accepts a positive integer version', () => {
    expect(parseVersion('3')).toEqual({ value: 3 });
  });
  it('defaults to current (null) when absent', () => {
    expect(parseVersion(null)).toEqual({ value: null });
    expect(parseVersion('')).toEqual({ value: null });
  });
  it('rejects non-integer / non-positive versions', () => {
    expect(parseVersion('0').error).toBeTruthy();
    expect(parseVersion('-1').error).toBeTruthy();
    expect(parseVersion('2.5').error).toBeTruthy();
    expect(parseVersion('abc').error).toBeTruthy();
  });
});
