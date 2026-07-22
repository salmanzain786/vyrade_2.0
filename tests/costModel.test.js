import { describe, it, expect } from 'vitest';
import { baseBlueprint } from './fixtures.js';
import { deriveCostModel } from '../lib/services/cost/costModel.js';
import { DEFAULT_MONTHLY_RUNS } from '../lib/services/cost/volume.js';
import {
  makeCostItem, floorConfidence, COST_CATEGORIES as CAT, CONFIDENCE,
} from '../lib/services/cost/taxonomy.js';

const PLATFORMS = ['n8n', 'make', 'zapier', 'claude'];
const catsOf = (model) => new Set(model.items.map((i) => i.category));
const itemFor = (model, category) => model.items.filter((i) => i.category === category);

describe('taxonomy — makeCostItem guards (never fabricate a price)', () => {
  it('builds a normalised item and defaults unit_price to null', () => {
    const item = makeCostItem({ component: 'Zapier', category: CAT.EXECUTION_TASK_CREDIT.key, cost_type: 'platform_task_usage' });
    expect(item.unit_price).toBeNull();
    expect(item.currency).toBe('USD');
    expect(item.confidence).toBe(CONFIDENCE.UNKNOWN);
  });

  it('rejects an unknown category', () => {
    expect(() => makeCostItem({ component: 'X', category: 'not_a_category', cost_type: 'y' })).toThrow(/unknown category/);
  });

  it('rejects an invalid confidence', () => {
    expect(() => makeCostItem({ component: 'X', category: CAT.UNKNOWN.key, cost_type: 'y', confidence: 'very-sure' })).toThrow(/invalid confidence/);
  });

  it('rejects a negative price if one is ever supplied (Phase 2 guard)', () => {
    expect(() => makeCostItem({ component: 'X', category: CAT.UNKNOWN.key, cost_type: 'y', unit_price: -3 })).toThrow(/non-negative/);
  });

  it('floorConfidence returns the weakest link', () => {
    expect(floorConfidence([{ confidence: 'high' }, { confidence: 'low' }, { confidence: 'medium' }])).toBe('low');
    expect(floorConfidence([])).toBe('unknown');
  });
});

describe('deriveCostModel — Definition of Done', () => {
  it('produces a report for every recommended platform', () => {
    for (const platform of PLATFORMS) {
      const model = deriveCostModel({ blueprint: baseBlueprint(), platform });
      expect(model.platform).toBe(platform);
      expect(model.items.length).toBeGreaterThan(0);
      expect(model.categories.length).toBeGreaterThan(0);
    }
  });

  it('breakdown always covers platform, external tools, hosting, storage and unknown', () => {
    const model = deriveCostModel({ blueprint: baseBlueprint(), platform: 'zapier' });
    const cats = catsOf(model);
    expect(cats).toContain(CAT.ORCHESTRATION_PLATFORM.key);
    expect(cats).toContain(CAT.EXTERNAL_API_TOOL.key);
    expect(cats).toContain(CAT.HOSTING_INFRASTRUCTURE.key);
    expect(cats).toContain(CAT.STORAGE_LOGGING.key);
    expect(cats).toContain(CAT.UNKNOWN.key); // honest catch-all is always present
  });

  it('NEVER emits a dollar amount in Phase 1 (no guess presented as fact)', () => {
    for (const platform of PLATFORMS) {
      const model = deriveCostModel({ blueprint: baseBlueprint(), platform });
      expect(model.estimated_total).toBeNull();
      for (const item of model.items) expect(item.unit_price).toBeNull();
    }
  });

  it('every estimate ships with assumptions and an overall confidence', () => {
    const model = deriveCostModel({ blueprint: baseBlueprint(), platform: 'make' });
    expect(model.assumptions.length).toBeGreaterThan(0);
    // Phase-1 framing must be spelled out, never hidden.
    expect(model.assumptions.join(' ')).toMatch(/structure and quantities|not yet resolved/i);
    expect(['high', 'medium', 'low', 'unknown']).toContain(model.confidence);
  });

  it('rejects an unknown platform instead of guessing', () => {
    expect(() => deriveCostModel({ blueprint: baseBlueprint(), platform: 'foobar' })).toThrow(/unknown platform/);
  });
});

describe('QA scenarios', () => {
  it('no volume provided → default assumption at LOW confidence, clearly flagged', () => {
    const bp = baseBlueprint({ volume: { estimated_executions: null, period: 'unknown', confidence: 'unknown' } });
    const model = deriveCostModel({ blueprint: bp, platform: 'zapier' });
    expect(model.volume.assumed).toBe(true);
    expect(model.volume.monthly_runs).toBe(DEFAULT_MONTHLY_RUNS);
    expect(model.volume.confidence).toBe('low');
    expect(model.confidence).toBe('low'); // whole estimate can't beat its volume basis
  });

  it('tool with no public pricing → marked unknown, price left null (not hallucinated)', () => {
    const model = deriveCostModel({ blueprint: baseBlueprint(), platform: 'n8n' });
    const tools = itemFor(model, CAT.EXTERNAL_API_TOOL.key);
    expect(tools.map((t) => t.component)).toEqual(expect.arrayContaining(['HubSpot', 'Slack']));
    for (const t of tools) {
      expect(t.unit_price).toBeNull();
      expect(t.price_source).toBe('unknown');
      expect(['low', 'unknown']).toContain(t.confidence);
    }
  });

  it('higher volume scales the metered task/operation quantity (Make/Zapier)', () => {
    const bp = baseBlueprint();
    for (const platform of ['zapier', 'make']) {
      const low = deriveCostModel({ blueprint: bp, platform, monthlyRuns: 100 });
      const high = deriveCostModel({ blueprint: bp, platform, monthlyRuns: 100_000 });
      const q = (m) => itemFor(m, CAT.EXECUTION_TASK_CREDIT.key)[0].quantity_estimate;
      expect(q(high)).toBeGreaterThan(q(low));
      expect(q(high) / q(low)).toBeCloseTo(1000, 0); // scales linearly with runs
    }
  });

  it('AI-heavy workflow surfaces a token-cost line with a quantity estimate', () => {
    const bp = baseBlueprint({
      process_steps: [
        { step_id: 's1', sequence: 1, action: 'Receive', action_type: 'receive_data' },
        { step_id: 's2', sequence: 2, action: 'Summarise with AI', action_type: 'ai_reasoning' },
        { step_id: 's3', sequence: 3, action: 'Draft reply', action_type: 'generate_content' },
      ],
    });
    const model = deriveCostModel({ blueprint: bp, platform: 'n8n', monthlyRuns: 1000 });
    const llm = itemFor(model, CAT.LLM_TOKEN.key);
    expect(llm).toHaveLength(1);
    expect(llm[0].billing_unit).toBe('token');
    // 1000 runs * 2 AI steps * 4000 tokens.
    expect(llm[0].quantity_estimate).toBe(1000 * 2 * 4000);
    expect(llm[0].unit_price).toBeNull();
  });

  it('non-AI workflow has NO token line (no phantom cost)', () => {
    const model = deriveCostModel({ blueprint: baseBlueprint(), platform: 'n8n' });
    expect(catsOf(model)).not.toContain(CAT.LLM_TOKEN.key);
  });
});

describe('platform-specific structure', () => {
  it('Claude Code export adds one MCP connector per external system + a token line', () => {
    const model = deriveCostModel({ blueprint: baseBlueprint(), platform: 'claude' });
    const mcp = itemFor(model, CAT.MCP_CONNECTOR.key);
    expect(mcp.map((m) => m.component)).toEqual(
      expect.arrayContaining(['HubSpot MCP connector', 'Slack MCP connector'])
    );
    expect(catsOf(model)).toContain(CAT.LLM_TOKEN.key); // Claude always uses tokens
    // Claude has no per-run platform task metering.
    expect(catsOf(model)).not.toContain(CAT.EXECUTION_TASK_CREDIT.key);
  });

  it('self-hosted n8n adds a hosting line; SaaS platforms mark hosting as included', () => {
    const n8n = deriveCostModel({ blueprint: baseBlueprint(), platform: 'n8n' });
    expect(itemFor(n8n, CAT.HOSTING_INFRASTRUCTURE.key)[0].component).toMatch(/self-hosting/i);

    const zap = deriveCostModel({ blueprint: baseBlueprint(), platform: 'zapier' });
    const host = itemFor(zap, CAT.HOSTING_INFRASTRUCTURE.key)[0];
    expect(host.quantity_estimate).toBe(0);
    expect(host.notes).toMatch(/managed|no separate hosting/i);
  });

  it('n8n with self_hosting_required=false does NOT bill hosting', () => {
    const bp = baseBlueprint({
      constraints: { ...baseBlueprint().constraints, self_hosting_required: false },
    });
    const model = deriveCostModel({ blueprint: bp, platform: 'n8n' });
    expect(itemFor(model, CAT.HOSTING_INFRASTRUCTURE.key)[0].quantity_estimate).toBe(0);
  });

  it('human-approval workflows surface a manual-operations cost', () => {
    const bp = baseBlueprint({ human_approval: { required: true, approval_points: ['Manager signs off refunds'] } });
    const model = deriveCostModel({ blueprint: bp, platform: 'make' });
    expect(catsOf(model)).toContain(CAT.HUMAN_MANUAL_OPS.key);
  });

  it('a Blueprint unknown flagged as blocks_cost_confidence lands in assumptions', () => {
    const bp = baseBlueprint({
      unknown_requirements: [
        { field_path: 'volume.estimated_executions', reason: 'Volume not confirmed', blocks_generation: false, blocks_cost_confidence: true },
      ],
    });
    const model = deriveCostModel({ blueprint: bp, platform: 'zapier' });
    expect(model.assumptions.join(' ')).toMatch(/Volume not confirmed/);
  });
});
