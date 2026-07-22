import { describe, it, expect } from 'vitest';
import { baseBlueprint } from './fixtures.js';
import { buildCostComparison, buildSuggestions, COMPARISON_PLATFORMS } from '../lib/services/cost/costComparison.js';

// Resolvers that know nothing → everything unpriced (the pre-seed reality).
const emptyResolvers = {
  platformPrice: async () => ({ price: null, confidence: 'unknown' }),
  connectorCost: async () => ({ cost: null, confidence: 'unknown' }),
  connectorInfo: async () => ({ found: false }),
};

function aiHumanBlueprint() {
  return baseBlueprint({
    process_steps: [
      { step_id: 's1', sequence: 1, action: 'Receive', action_type: 'receive_data' },
      { step_id: 's2', sequence: 2, action: 'Summarise', action_type: 'ai_reasoning' },
      { step_id: 's3', sequence: 3, action: 'Write CRM', action_type: 'write_data' },
      { step_id: 's4', sequence: 4, action: 'Manager approves', action_type: 'human_approval' },
    ],
    human_approval: { required: true, approval_points: ['refunds'] },
  });
}

describe('buildCostComparison', () => {
  it('returns an estimate for every modeled platform', async () => {
    const c = await buildCostComparison({ blueprint: baseBlueprint(), blueprintId: 'bp_1', blueprintVersion: 3, resolvers: emptyResolvers });
    expect(c.platforms.map((p) => p.platform)).toEqual(COMPARISON_PLATFORMS);
    expect(c.blueprint_id).toBe('bp_1');
    expect(c.suggestions.length).toBeGreaterThan(0);
  });

  it('claude estimate has no metered task line, others do', async () => {
    const c = await buildCostComparison({ blueprint: baseBlueprint(), resolvers: emptyResolvers });
    const claude = c.platforms.find((p) => p.platform === 'claude');
    const zapier = c.platforms.find((p) => p.platform === 'zapier');
    expect(claude.estimated_units).toEqual({});
    expect(zapier.estimated_units.task).toBeGreaterThan(0);
  });
});

describe('cost-saving suggestions — grounded, not fabricated', () => {
  it('flags AI token cost and human approval when the workflow has them', async () => {
    const c = await buildCostComparison({ blueprint: aiHumanBlueprint(), resolvers: emptyResolvers });
    const titles = c.suggestions.map((s) => s.title).join(' | ');
    expect(titles).toMatch(/AI token cost/i);
    expect(titles).toMatch(/Human approval/i);
  });

  it('suggests confirming volume when it was assumed', async () => {
    const noVolume = baseBlueprint({ volume: { estimated_executions: null, period: 'unknown', confidence: 'unknown' } });
    const c = await buildCostComparison({ blueprint: noVolume, resolvers: emptyResolvers });
    expect(c.volume_assumed).toBe(true);
    expect(c.suggestions.some((s) => /real monthly volume/i.test(s.title))).toBe(true);
  });

  it('tells the user to seed pricing when no total is available', async () => {
    const c = await buildCostComparison({ blueprint: baseBlueprint(), resolvers: emptyResolvers });
    expect(c.suggestions.some((s) => /seed pricing/i.test(s.title))).toBe(true);
  });

  it('names the cheapest platform once cores are priced', () => {
    // Direct unit test of the pure suggester with synthetic priced estimates.
    const platforms = [
      { platform: 'n8n', platform_name: 'n8n', estimated_total: 30, estimated_units: { execution: 500 }, cost_components: [], unknowns: [] },
      { platform: 'zapier', platform_name: 'Zapier', estimated_total: 55, estimated_units: { task: 1000 }, cost_components: [], unknowns: [] },
    ];
    const s = buildSuggestions(platforms, baseBlueprint());
    const rec = s.find((x) => x.kind === 'recommendation');
    expect(rec.title).toMatch(/n8n/);
    expect(rec.detail).toMatch(/\$30/);
  });

  it('warns that multi-step workflows favour n8n over Zapier', () => {
    const platforms = [
      { platform: 'n8n', platform_name: 'n8n', estimated_units: { execution: 500 }, cost_components: [], unknowns: [] },
      { platform: 'zapier', platform_name: 'Zapier', estimated_units: { task: 1500 }, cost_components: [], unknowns: [] },
    ];
    const s = buildSuggestions(platforms, baseBlueprint());
    expect(s.some((x) => /favour n8n|Multi-step/i.test(x.title))).toBe(true);
  });
});
