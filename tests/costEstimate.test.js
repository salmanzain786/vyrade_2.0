import { describe, it, expect } from 'vitest';
import { baseBlueprint } from './fixtures.js';
import { buildCostEstimate } from '../lib/services/cost/costEstimate.js';

// The Phase-6 spec scenario: Shopify order → filter paid → Sheet row → Slack.
function shopifyBlueprint() {
  return baseBlueprint({
    trigger: { trigger_type: 'event', event: 'new_order', source_system: 'Shopify', schedule: null },
    systems: [
      { name: 'Shopify', role: 'source', required: true },
      { name: 'Google Sheets', role: 'destination', required: true },
      { name: 'Slack', role: 'notification', required: false },
    ],
    process_steps: [
      { step_id: 's1', sequence: 1, action: 'New Shopify order', action_type: 'receive_data' },
      { step_id: 's2', sequence: 2, action: 'Only paid orders', action_type: 'validate_data' },
      { step_id: 's3', sequence: 3, action: 'Create Google Sheet row', action_type: 'write_data' },
      { step_id: 's4', sequence: 4, action: 'Send Slack message', action_type: 'notification' },
    ],
    volume: { estimated_executions: 500, period: 'month', confidence: 'user_stated' },
  });
}

// Resolvers that know NOTHING (mirrors "no pricing configured yet").
const emptyResolvers = {
  platformPrice: async () => ({ price: null, confidence: 'unknown', reason: 'no source' }),
  connectorCost: async (sys) =>
    sys === 'Slack'
      ? { cost: 0, confidence: 'medium', note: 'API adds no per-use cost on the current plan.' }
      : { cost: null, confidence: 'unknown', reason: 'No unit price.' },
  connectorInfo: async (sys) =>
    sys === 'Slack'
      ? { found: true, unit_price: null, pricing_model: 'workspace_plan', requires_paid_plan: false }
      : { found: false },
};

const comp = (est, name) => est.cost_components.find((c) => c.name === name);

describe('buildCostEstimate — Phase 6 output shape (spec example)', () => {
  it('produces the documented structure for Zapier with nothing priced', async () => {
    const est = await buildCostEstimate({
      blueprint: shopifyBlueprint(), platform: 'zapier',
      blueprintId: 'bp_123', blueprintVersion: 5, resolvers: emptyResolvers,
    });

    expect(est).toMatchObject({
      blueprint_id: 'bp_123', blueprint_version: 5, platform: 'zapier', monthly_volume: 500,
    });
    // estimated_units: 500 runs × 2 actions = 1,000 tasks (trigger + filter free).
    expect(est.estimated_units).toEqual({ task: 1000 });

    // The metered line: quantity present, price null. Confidence is 'low'
    // (not the spec's 'medium') because a FILTER is present — our mapper is
    // honest that branch rates are unknown, which the spec example glossed over.
    const tasks = comp(est, 'Zapier task usage');
    expect(tasks).toMatchObject({ quantity: 1000, unit: 'task', price: null, confidence: 'low' });

    // External tools carry their per-step volume; Sheets is unknown, Slack is $0.
    expect(comp(est, 'Google Sheets')).toMatchObject({ quantity: 500, price: null, confidence: 'unknown' });
    expect(comp(est, 'Google Sheets').reason).toMatch(/No explicit API price configured/);
    expect(comp(est, 'Slack')).toMatchObject({ line_cost: 0, confidence: 'medium' });

    // Unknowns include the plan and branch probability (a filter is present).
    expect(est.unknowns).toEqual(expect.arrayContaining(['Selected Zapier plan', 'Exact branch probability']));

    // No dollar total yet (core lines unpriced); overall confidence bounded.
    expect(est.estimated_total).toBeNull();
    expect(['low', 'unknown', 'medium']).toContain(est.confidence);
  });
});

describe('buildCostEstimate — prices applied', () => {
  const pricedResolvers = {
    platformPrice: async (_platform, componentType) => {
      if (componentType === 'platform_task_usage') {
        return { price: 0.02, confidence: 'high', source: { source_type: 'official_pricing_page', pricing_url: 'https://zapier.com/pricing' } };
      }
      if (componentType === 'platform_subscription') {
        return { price: 0, confidence: 'high', source: { source_type: 'official_pricing_page' } };
      }
      return { price: null, confidence: 'unknown' };
    },
    // Every external tool priced → core is fully priced.
    connectorCost: async (sys) => (sys === 'Slack'
      ? { cost: 0, confidence: 'medium', note: 'workspace plan' }
      : { cost: 10, confidence: 'high' }),
    connectorInfo: async (sys) => ({ found: true, unit_price: sys === 'Slack' ? null : 0.02, pricing_model: 'per_api_call', requires_paid_plan: false }),
  };

  it('computes a real headline total once every CORE line is priced', async () => {
    const est = await buildCostEstimate({
      blueprint: shopifyBlueprint(), platform: 'zapier', resolvers: pricedResolvers,
    });
    // Zapier tasks: 1000 × 0.02 = 20 ; subscription 0 ; Shopify 10 ; Sheets 10 ; Slack 0 ; hosting(managed) 0.
    // Core total = 20 + 0 + 10 + 10 + 0 + 0 = 40.
    expect(est.estimated_total).toBe(40);
    // Price applied (0.02 × 1000 = 20). Confidence is floored to 'low' by the
    // filter-driven metering confidence, even though the PRICE is high-confidence.
    expect(comp(est, 'Zapier task usage')).toMatchObject({ price: 0.02, line_cost: 20, confidence: 'low' });
    expect(est.currency).toBe('USD');
  });

  it('a priced metered line reports the source in its reason', async () => {
    const est = await buildCostEstimate({ blueprint: shopifyBlueprint(), platform: 'zapier', resolvers: pricedResolvers });
    expect(comp(est, 'Zapier task usage').reason).toMatch(/official_pricing_page/);
  });
});

describe('buildCostEstimate — platform variance', () => {
  it('Claude Code has no metered task line and no estimated_units', async () => {
    const est = await buildCostEstimate({ blueprint: shopifyBlueprint(), platform: 'claude', resolvers: emptyResolvers });
    expect(est.estimated_units).toEqual({});
    expect(est.cost_components.find((c) => c.category === 'execution_task_credit')).toBeUndefined();
    // MCP connectors appear instead.
    expect(est.cost_components.some((c) => c.unit === 'connector')).toBe(true);
  });

  it('n8n self-hosted surfaces an unpriced hosting line and a hosting unknown', async () => {
    const est = await buildCostEstimate({ blueprint: shopifyBlueprint(), platform: 'n8n', resolvers: emptyResolvers });
    const hosting = est.cost_components.find((c) => c.category === 'hosting_infrastructure');
    expect(hosting.price).toBeNull();
    expect(est.unknowns).toContain('Hosting / VPS cost');
  });
});
