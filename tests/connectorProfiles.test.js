import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PRICING_MODELS, governConfidence, noProfileResult,
  resolveConnectorProfile, estimateConnectorMonthlyCost,
} from '../lib/services/cost/connectorProfiles.js';

// The two spec examples as DB-shaped rows.
const emailValidation = {
  connector_name: 'Email Validation API', system_name: 'Email Validation API',
  pricing_model: 'per_api_call', unit_name: 'validation',
  unit_price: null, confidence: 'unknown', notes: 'Provider not selected yet.',
};
const slack = {
  connector_name: 'Slack', system_name: 'Slack', pricing_model: 'workspace_plan',
  requires_paid_plan: 0, unit_price: null, confidence: 'medium',
  notes: 'Slack API itself may not add per-message cost, but workspace plan limits apply.',
};

describe('governConfidence — honest by construction', () => {
  it('an unpriced usage connector is unknown, whatever it claims', () => {
    expect(governConfidence({ ...emailValidation, confidence: 'high' })).toBe('unknown');
  });

  it('a no-added-cost workspace plan keeps its (medium) confidence without a price', () => {
    expect(governConfidence(slack)).toBe('medium');
  });

  it("a 'high' claim without a pricing_url is demoted to medium", () => {
    const priced = { pricing_model: 'per_api_call', unit_price: 0.004, confidence: 'high' };
    expect(governConfidence(priced)).toBe('medium');
    expect(governConfidence({ ...priced, pricing_url: 'https://x.com/pricing' })).toBe('high');
  });
});

describe('resolveConnectorProfile', () => {
  it('no profile → honest not-found', () => {
    const r = resolveConnectorProfile(null, { systemName: 'Segment' });
    expect(r).toMatchObject({ found: false, unit_price: null, confidence: 'unknown' });
    expect(r.reason).toMatch(/No pricing profile found for connector 'Segment'/);
  });

  it('normalises DECIMAL strings and tinyint flags', () => {
    const r = resolveConnectorProfile({
      connector_name: 'X', pricing_model: 'per_api_call', pricing_url: 'https://x/p',
      unit_price: '0.004000', included_units: '1000', overage_price: '0.006000',
      free_tier_available: 1, requires_paid_plan: 0, confidence: 'high',
    });
    expect(r.unit_price).toBe(0.004);
    expect(r.included_units).toBe(1000);
    expect(r.overage_price).toBe(0.006);
    expect(r.free_tier_available).toBe(true);
    expect(r.requires_paid_plan).toBe(false);
    expect(r.confidence).toBe('high'); // priced + url → allowed
  });
});

describe('estimateConnectorMonthlyCost — spec examples', () => {
  it('Email Validation API (no provider yet) → cost null, unknown, no guess', () => {
    const r = estimateConnectorMonthlyCost(emailValidation, { monthlyUnits: 5000 });
    expect(r.cost).toBeNull();
    expect(r.confidence).toBe('unknown');
    expect(r.reason).toMatch(/No unit price/i);
  });

  it('Slack (workspace plan, no paid plan) → a real $0 at medium confidence', () => {
    const r = estimateConnectorMonthlyCost(slack, { monthlyUnits: 5000 });
    expect(r.cost).toBe(0);            // genuinely no added cost, not "unknown"
    expect(r.confidence).toBe('medium');
    expect(r.note).toMatch(/no per-use cost/i);
  });

  it('usage-based with included allowance bills only the overage', () => {
    const profile = {
      pricing_model: 'per_api_call', pricing_url: 'https://x/p',
      unit_price: 0.004, overage_price: 0.006, included_units: 1000, confidence: 'high',
    };
    const r = estimateConnectorMonthlyCost(profile, { monthlyUnits: 5000 });
    // (5000 - 1000) * 0.006
    expect(r.cost).toBe(24);
    expect(r.breakdown.billable_units).toBe(4000);
    expect(r.confidence).toBe('high');
  });

  it('within the free tier → $0', () => {
    const profile = { pricing_model: 'per_api_call', unit_price: 0.004, included_units: 1000, free_tier_available: 1, pricing_url: 'u' };
    expect(estimateConnectorMonthlyCost(profile, { monthlyUnits: 800 }).cost).toBe(0);
  });

  it('null profile → unknown', () => {
    expect(estimateConnectorMonthlyCost(null, { monthlyUnits: 100 })).toMatchObject({ cost: null, confidence: 'unknown' });
  });
});

// ── Repository (mocked pool) ────────────────────────────────────────────────
const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const repo = await import('../lib/services/cost/connectorProfileRepository.js');

describe('connectorProfileRepository (mocked pool)', () => {
  beforeEach(() => query.mockReset());

  it('resolveConnector returns a governed summary when a profile exists', async () => {
    query.mockResolvedValueOnce([[slack]]);
    const r = await repo.resolveConnector('Slack', 'zapier');
    expect(r.found).toBe(true);
    expect(r.confidence).toBe('medium');
    // Looked up by system OR connector name, scoped to the platform.
    expect(query.mock.calls[0][1]).toEqual(['Slack', 'Slack', 'zapier']);
  });

  it('resolveConnector returns honest not-found with no profile', async () => {
    query.mockResolvedValueOnce([[]]);
    const r = await repo.resolveConnector('Segment', 'make');
    expect(r).toMatchObject({ found: false, confidence: 'unknown' });
  });

  it('estimateConnectorCost composes lookup + estimate', async () => {
    query.mockResolvedValueOnce([[slack]]);
    const r = await repo.estimateConnectorCost('Slack', { monthlyUnits: 5000, platform: 'zapier' });
    expect(r.cost).toBe(0);
  });

  it('upsert rejects an invalid pricing_model', async () => {
    await expect(repo.upsertConnectorProfile({ connectorName: 'X', pricingModel: 'vibes' }))
      .rejects.toThrow(/invalid pricing_model/);
    expect(query).not.toHaveBeenCalled();
  });

  it('upsert converts booleans to tinyint and inserts', async () => {
    query.mockResolvedValueOnce([{}]);
    await repo.upsertConnectorProfile({
      connectorName: 'Slack', platform: 'zapier', systemName: 'Slack',
      pricingModel: PRICING_MODELS.WORKSPACE_PLAN, requiresPaidPlan: false, freeTierAvailable: true,
      confidence: 'medium',
    });
    const [sqlText, params] = query.mock.calls[0];
    expect(sqlText).toMatch(/INSERT INTO connector_cost_profiles/);
    expect(sqlText).toMatch(/ON DUPLICATE KEY UPDATE/);
    expect(params).toContain(0); // requiresPaidPlan false → 0
    expect(params).toContain(1); // freeTierAvailable true → 1
  });
});
