import { describe, it, expect } from 'vitest';
import { baseBlueprint } from './fixtures.js';
import { recommend } from '../lib/services/recommendation/recommendationEngine.js';
import { extractSignals, normalizeSkill } from '../lib/services/recommendation/blueprintSignals.js';

const constraints = (over = {}) => ({
  budget: null, technical_skill: null, self_hosting_required: null,
  security_requirements: [], compliance_requirements: [], latency_requirement: null,
  implementation_constraints: { required_platforms: [], prohibited_platforms: [], existing_platforms: [], platform_preferences: [] },
  ...over,
});

const topRejectedNames = (rec) => rec.rejected.map((r) => r.platform);

describe('signal extraction', () => {
  it('normalizes free-text technical skill', () => {
    expect(normalizeSkill('Our ops team, non-technical')).toBe('non_technical');
    expect(normalizeSkill('We have a software engineering team')).toBe('developer');
    expect(normalizeSkill('some low-code experience')).toBe('some');
    expect(normalizeSkill('')).toBe('unknown');
  });

  it('derives volume tier + branching + AI from the Blueprint', () => {
    const bp = baseBlueprint({
      business_rules: [{ rule_id: 'r1', description: 'x', condition: { field: 'a', operator: 'equals', value: ['b'] }, result: { action: 'y', value: 'z' } }],
      process_steps: [
        { step_id: 's1', sequence: 1, action: 'recv', action_type: 'receive_data' },
        { step_id: 's2', sequence: 2, action: 'ai', action_type: 'ai_reasoning' },
      ],
      volume: { estimated_executions: 100000, period: 'month', confidence: 'user_stated' },
    });
    const sig = extractSignals(bp);
    expect(sig.volume_tier).toBe('high');
    expect(sig.ai_required).toBe(true);
    expect(sig.branching_count).toBeGreaterThan(0);
  });
});

describe('DoD — every completed Blueprint yields a recommendation with alternatives', () => {
  it('always returns a recommended option + at least one alternative, each with reason/risk/confidence/best_for', () => {
    const rec = recommend({ blueprint: baseBlueprint(), blueprintId: 'bp_1', blueprintVersion: 3 });
    expect(rec.recommended).toBeTruthy();
    expect(rec.alternatives.length).toBeGreaterThanOrEqual(1);
    expect(['unknown', 'low', 'medium', 'high']).toContain(rec.confidence);
    for (const opt of [rec.recommended, ...rec.alternatives, ...rec.rejected]) {
      expect(opt).toHaveProperty('reason');
      expect(opt).toHaveProperty('risks');
      expect(opt).toHaveProperty('best_for');
      expect(opt).toHaveProperty('suitability');
      expect(typeof opt.score).toBe('number');
    }
  });
});

describe('QA scenario — high volume prefers self-hosted / custom where cost matters', () => {
  it('a high-volume workflow does NOT recommend Zapier, and favours n8n self-hosted or Python', () => {
    const bp = baseBlueprint({
      volume: { estimated_executions: 200000, period: 'month', confidence: 'user_stated' },
      constraints: constraints({ technical_skill: 'we have engineers' }),
    });
    const rec = recommend({ blueprint: bp });
    expect(['n8n_selfhosted', 'python']).toContain(rec.recommended.platform);
    // Zapier should not be the recommendation at this volume.
    expect(rec.recommended.platform).not.toBe('zapier');
  });
});

describe('QA scenario — non-technical + simple prefers a workflow builder', () => {
  it('recommends Make or Zapier for a small non-technical automation', () => {
    const bp = baseBlueprint({
      volume: { estimated_executions: 200, period: 'month', confidence: 'user_stated' },
      constraints: constraints({ technical_skill: 'non-technical ops team' }),
      process_steps: [
        { step_id: 's1', sequence: 1, action: 'recv', action_type: 'receive_data' },
        { step_id: 's2', sequence: 2, action: 'write', action_type: 'write_data' },
      ],
      business_rules: [],
    });
    const rec = recommend({ blueprint: bp });
    expect(['make', 'zapier']).toContain(rec.recommended.platform);
    // Developer-only options should rank below the builders.
    expect(rec.recommended.score).toBeGreaterThan(
      (rec.rejected.find((r) => r.platform === 'python')?.score ?? 0)
    );
  });
});

describe('QA scenario — custom branching raises Claude / Python', () => {
  it('heavy branching + AI pushes a code option to the top with a developer team', () => {
    const bp = baseBlueprint({
      constraints: constraints({ technical_skill: 'software engineers' }),
      business_rules: Array.from({ length: 4 }, (_, i) => ({
        rule_id: `r${i}`, description: 'x', condition: { field: 'a', operator: 'equals', value: ['b'] }, result: { action: 'y', value: 'z' },
      })),
      process_steps: [
        { step_id: 's1', sequence: 1, action: 'recv', action_type: 'receive_data' },
        { step_id: 's2', sequence: 2, action: 'decide', action_type: 'business_decision' },
        { step_id: 's3', sequence: 3, action: 'ai', action_type: 'ai_reasoning' },
        { step_id: 's4', sequence: 4, action: 'gen', action_type: 'generate_content' },
      ],
    });
    const rec = recommend({ blueprint: bp });
    expect(['claude', 'python']).toContain(rec.recommended.platform);
    expect(rec.recommended.why_fits.join(' ')).toMatch(/custom|logic|AI/i);
  });
});

describe('QA scenario — changing expected volume changes the recommendation', () => {
  it('the same Blueprint recommends differently at low vs. very-high volume', () => {
    const base = baseBlueprint({ constraints: constraints({ technical_skill: 'non-technical' }) });
    const low = recommend({ blueprint: base, monthlyRuns: 200 });
    const high = recommend({ blueprint: base, monthlyRuns: 500000 });
    // At least the ranking/score must shift with volume.
    const zapierLow = [low.recommended, ...low.alternatives, ...low.rejected].find((o) => o.platform === 'zapier');
    const zapierHigh = [high.recommended, ...high.alternatives, ...high.rejected].find((o) => o.platform === 'zapier');
    expect(zapierHigh.score).toBeLessThan(zapierLow.score); // Zapier weakens at volume
  });
});

describe('hard constraints', () => {
  it('a prohibited platform is rejected outright (score 0)', () => {
    const bp = baseBlueprint({ constraints: constraints({ implementation_constraints: { required_platforms: [], prohibited_platforms: ['Zapier'], existing_platforms: [], platform_preferences: [] } }) });
    const rec = recommend({ blueprint: bp });
    const zap = rec.rejected.find((r) => r.platform === 'zapier');
    expect(zap.score).toBe(0);
    expect(rec.recommended.platform).not.toBe('zapier');
  });

  it('a required platform is recommended with high confidence', () => {
    const bp = baseBlueprint({ constraints: constraints({ implementation_constraints: { required_platforms: ['n8n'], prohibited_platforms: [], existing_platforms: [], platform_preferences: [] } }) });
    const rec = recommend({ blueprint: bp });
    expect(rec.recommended.export_platform).toBe('n8n');
    expect(rec.confidence).toBe('high');
  });

  it('a self-hosting requirement rules out SaaS-only platforms', () => {
    const bp = baseBlueprint({ constraints: constraints({ self_hosting_required: true }) });
    const rec = recommend({ blueprint: bp });
    // Zapier / Make can't self-host → should not be the recommendation.
    expect(['zapier', 'make']).not.toContain(rec.recommended.platform);
  });
});

describe('output collapses n8n to a single best variant', () => {
  it('never lists both n8n self-hosted and n8n cloud', () => {
    const rec = recommend({ blueprint: baseBlueprint() });
    const n8nEntries = [rec.recommended, ...rec.alternatives, ...rec.rejected].filter((o) => o.export_platform === 'n8n');
    expect(n8nEntries.length).toBe(1);
  });
});
