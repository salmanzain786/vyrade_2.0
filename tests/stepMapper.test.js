import { describe, it, expect } from 'vitest';
import { baseBlueprint } from './fixtures.js';
import { mapStepsToCostUnits, STEP_COST_PROFILE } from '../lib/services/cost/stepMapper.js';

// A Shopify-order workflow matching the task's Zapier example:
//   Trigger: new order (free) · Filter: paid only (free) · 2 actions (billable)
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
  });
}

describe('Zapier mapper — tasks = successful actions only', () => {
  it('the task spec example: 500 orders, trigger+filter free, 2 actions → 1,000 tasks', () => {
    const r = mapStepsToCostUnits({ blueprint: shopifyBlueprint(), platform: 'zapier', monthlyRuns: 500 });
    expect(r.units_per_run).toBe(2);          // 2 actions; trigger + filter are free
    expect(r.monthly_units).toBe(1000);
    // The trigger and filter contribute zero.
    const byId = Object.fromEntries(r.per_step.map((s) => [s.step_id, s.unit_contribution_per_run]));
    expect(byId.s1).toBe(0); // trigger
    expect(byId.s2).toBe(0); // filter
    expect(byId.s3).toBe(1); // action
    expect(byId.s4).toBe(1); // action
  });

  it('branch probability lowers a conditional action’s task contribution', () => {
    const r = mapStepsToCostUnits({
      blueprint: shopifyBlueprint(), platform: 'zapier', monthlyRuns: 500,
      branchProbabilities: { s4: 0.5 }, // Slack only for half the orders
    });
    expect(r.units_per_run).toBe(1.5);       // 1 + 0.5
    expect(r.monthly_units).toBe(750);
  });
});

describe('n8n mapper — executions, not nodes', () => {
  it('executions = monthly_events × runs_per_event; node count is irrelevant', () => {
    const small = mapStepsToCostUnits({ blueprint: baseBlueprint(), platform: 'n8n', monthlyRuns: 5000 });
    const big = mapStepsToCostUnits({
      blueprint: baseBlueprint({
        process_steps: Array.from({ length: 20 }, (_, i) => ({
          step_id: `s${i}`, sequence: i + 1, action: `step ${i}`, action_type: 'write_data',
        })),
      }),
      platform: 'n8n', monthlyRuns: 5000,
    });
    expect(small.monthly_units).toBe(5000);
    expect(big.monthly_units).toBe(5000);     // 20 nodes, still 5,000 executions
  });

  it('honours workflow_runs_per_event', () => {
    const r = mapStepsToCostUnits({ blueprint: baseBlueprint(), platform: 'n8n', monthlyRuns: 5000, runsPerEvent: 2 });
    expect(r.monthly_units).toBe(10000);
  });

  it('reports external calls per external step (5,000 leads → 5,000 CRM writes)', () => {
    const r = mapStepsToCostUnits({ blueprint: baseBlueprint(), platform: 'n8n', monthlyRuns: 5000 });
    // baseBlueprint: receive_data + write_data are both external touches.
    const write = r.external_calls.find((c) => c.step_id === 's2');
    expect(write.monthly_calls).toBe(5000);
    expect(r.external_calls.every((c) => c.monthly_calls === 5000)).toBe(true);
  });
});

describe('Make mapper — operations weighted per module', () => {
  it('sums module weights; filters count as 0', () => {
    const r = mapStepsToCostUnits({ blueprint: shopifyBlueprint(), platform: 'make', monthlyRuns: 100 });
    // receive(1) + filter(0) + write(1) + notify(1) = 3 operations/run
    expect(r.units_per_run).toBe(3);
    expect(r.monthly_units).toBe(300);
  });

  it('AI modules carry a heavier, low-confidence weight', () => {
    const bp = baseBlueprint({
      process_steps: [
        { step_id: 's1', sequence: 1, action: 'Receive', action_type: 'receive_data' },
        { step_id: 's2', sequence: 2, action: 'Summarise', action_type: 'ai_reasoning' },
      ],
    });
    const r = mapStepsToCostUnits({ blueprint: bp, platform: 'make', monthlyRuns: 100 });
    expect(r.units_per_run).toBe(1 + STEP_COST_PROFILE.ai_reasoning.make_weight); // 1 + 3
    expect(r.confidence).toBe('low'); // variable AI module softens confidence
    expect(r.ai_step_count).toBe(1);
  });

  it('bundle multiplier scales operations (iterators returning many bundles)', () => {
    const base = mapStepsToCostUnits({ blueprint: shopifyBlueprint(), platform: 'make', monthlyRuns: 100 });
    const bundled = mapStepsToCostUnits({ blueprint: shopifyBlueprint(), platform: 'make', monthlyRuns: 100, bundleMultiplier: 3 });
    expect(bundled.units_per_run).toBe(base.units_per_run * 3);
  });
});

describe('MCP / Claude mapper — not metered per run', () => {
  it('produces zero metered units and does not fabricate a price', () => {
    const r = mapStepsToCostUnits({ blueprint: shopifyBlueprint(), platform: 'claude', monthlyRuns: 500 });
    expect(r.metered).toBe(false);
    expect(r.units_per_run).toBe(0);
    expect(r.monthly_units).toBe(0);
    expect(r.primary_unit).toBe('unknown');
  });

  it("resolves via the 'mcp' alias identically", () => {
    const viaMcp = mapStepsToCostUnits({ blueprint: shopifyBlueprint(), platform: 'mcp', monthlyRuns: 500 });
    expect(viaMcp.metered).toBe(false);
    expect(viaMcp.monthly_units).toBe(0);
  });
});

describe('confidence signalling', () => {
  it('filters/routers drop confidence (branch rates unknown)', () => {
    const r = mapStepsToCostUnits({ blueprint: shopifyBlueprint(), platform: 'zapier', monthlyRuns: 500 });
    expect(r.confidence).toBe('low');
    expect(r.assumptions.join(' ')).toMatch(/branch rates|100%/i);
  });

  it('a clean linear workflow keeps medium confidence', () => {
    const r = mapStepsToCostUnits({ blueprint: baseBlueprint(), platform: 'zapier', monthlyRuns: 500 });
    expect(r.confidence).toBe('medium');
  });
});
