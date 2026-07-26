import { describe, it, expect } from 'vitest';
import { baseBlueprint } from './fixtures.js';
import { freshnessOf, agedConfidence, freshnessLabel, FRESHNESS } from '../lib/services/cost/freshness.js';
import { buildCostEstimate } from '../lib/services/cost/costEstimate.js';

const NOW = Date.UTC(2026, 6, 26); // fixed clock for deterministic ages
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();

describe('freshnessOf — the 0-30 / 31-90 / 90+ rule', () => {
  it('0–30 days → current', () => {
    expect(freshnessOf(daysAgo(0), NOW).status).toBe(FRESHNESS.CURRENT);
    expect(freshnessOf(daysAgo(30), NOW).status).toBe(FRESHNESS.CURRENT);
  });
  it('31–90 days → needs_review', () => {
    expect(freshnessOf(daysAgo(31), NOW).status).toBe(FRESHNESS.NEEDS_REVIEW);
    expect(freshnessOf(daysAgo(90), NOW).status).toBe(FRESHNESS.NEEDS_REVIEW);
  });
  it('90+ days → stale', () => {
    expect(freshnessOf(daysAgo(91), NOW).status).toBe(FRESHNESS.STALE);
    expect(freshnessOf(daysAgo(400), NOW).status).toBe(FRESHNESS.STALE);
  });
  it('no / bad date → unknown', () => {
    expect(freshnessOf(null, NOW).status).toBe(FRESHNESS.UNKNOWN);
    expect(freshnessOf('not-a-date', NOW).status).toBe(FRESHNESS.UNKNOWN);
  });
  it('reports age in whole days', () => {
    expect(freshnessOf(daysAgo(45), NOW).age_days).toBe(45);
  });
});

describe('agedConfidence — stale pricing is not trusted', () => {
  it('caps by staleness, never inflates', () => {
    expect(agedConfidence('high', FRESHNESS.CURRENT)).toBe('high');
    expect(agedConfidence('high', FRESHNESS.NEEDS_REVIEW)).toBe('medium');
    expect(agedConfidence('high', FRESHNESS.STALE)).toBe('low');
    expect(agedConfidence('low', FRESHNESS.CURRENT)).toBe('low'); // never raised
  });
});

describe('freshnessLabel', () => {
  it('warns for stale and needs_review, silent for current', () => {
    expect(freshnessLabel(FRESHNESS.STALE)).toMatch(/outdated/i);
    expect(freshnessLabel(FRESHNESS.NEEDS_REVIEW)).toMatch(/review/i);
    expect(freshnessLabel(FRESHNESS.CURRENT)).toBeNull();
  });
});

describe('estimate applies freshness to a priced line', () => {
  const pricedAt = (checkedAt) => ({
    platformPrice: async (_p, ct) => ct === 'platform_task_usage'
      ? { price: 0.02, confidence: 'high', source: { source_type: 'official_pricing_page', pricing_url: 'https://x/p', last_checked_at: checkedAt } }
      : { price: null, confidence: 'unknown' },
    connectorCost: async () => ({ cost: null, confidence: 'unknown' }),
    connectorInfo: async () => ({ found: false }),
  });
  const taskLine = (est) => est.cost_components.find((c) => c.name === 'Zapier task usage');

  it('a fresh price is NOT downgraded (kept at the metering ceiling, medium)', async () => {
    // The Zapier task line is capped at 'medium' by metering confidence, so a
    // fresh high-confidence price can't lift it — but freshness must not lower it.
    const est = await buildCostEstimate({ blueprint: baseBlueprint(), platform: 'zapier', resolvers: pricedAt(daysAgo(5)), now: NOW });
    const line = taskLine(est);
    expect(line.confidence).toBe('medium');
    expect(line.freshness).toBe('current');
    expect(line.freshness_label).toBeNull();
  });

  it('a 4-month-old official price is downgraded to low + flagged outdated', async () => {
    const est = await buildCostEstimate({ blueprint: baseBlueprint(), platform: 'zapier', resolvers: pricedAt(daysAgo(120)), now: NOW });
    const line = taskLine(est);
    expect(line.confidence).toBe('low');            // aged down from high
    expect(line.freshness).toBe('stale');
    expect(line.freshness_label).toMatch(/outdated/i);
    expect(line.age_days).toBe(120);
    // The staleness also surfaces as an explicit unknown.
    expect(est.unknowns.some((u) => /may be outdated/i.test(u))).toBe(true);
  });

  it('a 60-day-old price becomes needs_review at medium confidence', async () => {
    const est = await buildCostEstimate({ blueprint: baseBlueprint(), platform: 'zapier', resolvers: pricedAt(daysAgo(60)), now: NOW });
    const line = taskLine(est);
    expect(line.confidence).toBe('medium');
    expect(line.freshness).toBe('needs_review');
  });
});
