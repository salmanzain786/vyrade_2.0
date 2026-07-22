import { describe, it, expect } from 'vitest';
import { baseBlueprint } from './fixtures.js';
import {
  PLATFORM_BILLING_MODELS, getBillingModel, unitsPerRun,
} from '../lib/services/cost/platformBillingModels.js';
import { deriveCostModel } from '../lib/services/cost/costModel.js';
import { EXPORT_PLATFORMS } from '../lib/exporters/registry.js';
import { COST_CATEGORIES as CAT } from '../lib/services/cost/taxonomy.js';

const execItem = (m) => m.items.find((i) => i.category === CAT.EXECUTION_TASK_CREDIT.key);

describe('platform billing models — data integrity', () => {
  it('covers every export platform', () => {
    for (const key of Object.keys(EXPORT_PLATFORMS)) {
      expect(getBillingModel(key), `missing billing model for '${key}'`).toBeTruthy();
    }
  });

  it('each model has the required, self-consistent fields', () => {
    for (const [key, m] of Object.entries(PLATFORM_BILLING_MODELS)) {
      expect(m.platform).toBe(key);
      expect(typeof m.billing_model).toBe('string');
      expect(typeof m.primary_unit).toBe('string');
      expect(m.node_level_pricing).toBe(false); // none of these bill per node
      expect(typeof m.metered).toBe('boolean');
      expect(['per_execution', 'per_billable_action', 'per_module', 'none']).toContain(m.execution_quantity_basis);
      // A metered platform must have a real per-run basis; an unmetered one must not.
      if (m.metered) expect(m.execution_quantity_basis).not.toBe('none');
      else expect(m.execution_quantity_basis).toBe('none');
      expect(typeof m.notes).toBe('string');
      expect(m.notes.length).toBeGreaterThan(0);
    }
  });

  it('matches the Phase 2 spec headline for each platform', () => {
    expect(getBillingModel('n8n')).toMatchObject({ billing_model: 'workflow_execution', primary_unit: 'execution', node_level_pricing: false });
    expect(getBillingModel('make')).toMatchObject({ billing_model: 'credits', node_level_pricing: false, default_module_weight: 1 });
    expect(getBillingModel('zapier')).toMatchObject({ billing_model: 'tasks', primary_unit: 'task' });
    expect(getBillingModel('zapier').free_step_types).toEqual(expect.arrayContaining(['trigger', 'filter', 'path']));
  });

  it("resolves the 'mcp' alias to the Claude Code model (underlying_service)", () => {
    const viaAlias = getBillingModel('mcp');
    expect(viaAlias).toBe(getBillingModel('claude'));
    expect(viaAlias).toMatchObject({ billing_model: 'underlying_service', primary_unit: 'unknown', metered: false });
  });

  it('returns null for an unknown platform (no guessing)', () => {
    expect(getBillingModel('airtable_automations')).toBeNull();
    expect(getBillingModel(undefined)).toBeNull();
  });
});

describe('unitsPerRun — per-run metering math', () => {
  const counts = { billableActionSteps: 3, moduleCount: 5 };
  it('per_execution → 1 regardless of node count', () => {
    expect(unitsPerRun(getBillingModel('n8n'), counts)).toBe(1);
  });
  it('per_billable_action → billable action steps (Zapier tasks)', () => {
    expect(unitsPerRun(getBillingModel('zapier'), counts)).toBe(3);
  });
  it('per_module → modules × default_module_weight (Make operations)', () => {
    expect(unitsPerRun(getBillingModel('make'), counts)).toBe(5);
  });
  it('unmetered platform → 0 (Claude Code)', () => {
    expect(unitsPerRun(getBillingModel('claude'), counts)).toBe(0);
  });
});

describe('engine consumes the billing model (data-driven, not hardcoded)', () => {
  it('n8n bills per execution — quantity is monthly_runs, node count irrelevant', () => {
    const m = deriveCostModel({ blueprint: baseBlueprint(), platform: 'n8n', monthlyRuns: 1000 });
    const item = execItem(m);
    expect(item.billing_unit).toBe('execution');
    expect(item.quantity_estimate).toBe(1000);
  });

  it('zapier bills per billable action step (triggers are free)', () => {
    // baseBlueprint: receive_data (trigger = free) + write_data (1 task).
    const m = deriveCostModel({ blueprint: baseBlueprint(), platform: 'zapier', monthlyRuns: 1000 });
    const item = execItem(m);
    expect(item.billing_unit).toBe('task');
    expect(item.quantity_estimate).toBe(1000 * 1);
  });

  it('make bills per module (× weight)', () => {
    const m = deriveCostModel({ blueprint: baseBlueprint(), platform: 'make', monthlyRuns: 1000 });
    const item = execItem(m);
    expect(item.billing_unit).toBe('operation');
    expect(item.quantity_estimate).toBe(1000 * 2); // 2 process_steps → 2 modules
  });

  it('claude has no metered execution line (cost is tokens + underlying APIs)', () => {
    const m = deriveCostModel({ blueprint: baseBlueprint(), platform: 'claude' });
    expect(execItem(m)).toBeUndefined();
  });

  it('a higher default_module_weight would raise Make operations (weighting is honoured)', () => {
    // Prove the engine reads default_module_weight rather than assuming 1.
    const weighted = { ...getBillingModel('make'), default_module_weight: 3 };
    expect(unitsPerRun(weighted, { billableActionSteps: 2, moduleCount: 4 })).toBe(12);
  });
});
