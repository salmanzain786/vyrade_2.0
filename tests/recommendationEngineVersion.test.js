import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { baseBlueprint } from './fixtures.js';
import { recommend, ENGINE_VERSION } from '../lib/services/recommendation/recommendationEngine.js';

/**
 * Engine-version guard (process-issue → automated tripwire).
 *
 * Persisted recommendations are labelled with ENGINE_VERSION, and GET returns a
 * stored run as the current answer. So if scoring RULES change but the version
 * does NOT, an old-rules result can be served under the new-rules label.
 *
 * This test pins BOTH the expected engine version AND a fingerprint of the
 * engine's scoring output over a fixed scenario matrix. Change scoring in any
 * material way and the fingerprint assertion fails — forcing a deliberate:
 *   1. bump ENGINE_VERSION (rules-v1 → rules-v2 …), and
 *   2. update EXPECTED_SCORING_FINGERPRINT below to the new value the failure
 *      message prints.
 * Both edits land in the same PR, so version and behaviour can never silently
 * drift apart.
 */

// Bump these two together whenever platform scoring changes materially.
const EXPECTED_ENGINE_VERSION = 'rules-v1';
const EXPECTED_SCORING_FINGERPRINT = '932100fac0c0d9d9f554a1fc079db2acf5c0efb2bf6bf00f036d9a6a6983bcbe';

const constraints = (over = {}) => ({
  budget: null, technical_skill: null, self_hosting_required: null,
  security_requirements: [], compliance_requirements: [], latency_requirement: null,
  implementation_constraints: { required_platforms: [], prohibited_platforms: [], existing_platforms: [], platform_preferences: [] },
  ...over,
});

// A fixed, representative matrix — no clock, no randomness → fully deterministic.
const SCENARIOS = [
  { name: 'default', bp: baseBlueprint(), runs: null },
  { name: 'high-vol-eng', bp: baseBlueprint({ volume: { estimated_executions: 200000, period: 'month', confidence: 'user_stated' }, constraints: constraints({ technical_skill: 'we have engineers' }) }), runs: null },
  { name: 'nontech-simple', bp: baseBlueprint({ constraints: constraints({ technical_skill: 'non-technical ops team' }), business_rules: [] }), runs: 200 },
  { name: 'branching-ai', bp: baseBlueprint({ constraints: constraints({ technical_skill: 'software engineers' }), business_rules: Array.from({ length: 4 }, (_, i) => ({ rule_id: `r${i}`, description: 'x', condition: { field: 'a', operator: 'equals', value: ['b'] }, result: { action: 'y', value: 'z' } })) }), runs: null },
  { name: 'selfhost', bp: baseBlueprint({ constraints: constraints({ self_hosting_required: true }) }), runs: null },
  { name: 'volume-500k', bp: baseBlueprint({ constraints: constraints({ technical_skill: 'non-technical' }) }), runs: 500000 },
];

function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}
function project(rec) {
  const all = [rec.recommended, ...rec.alternatives, ...rec.rejected]
    .map((o) => ({ p: o.platform, s: o.score, sc: o.suitability }))
    .sort((a, b) => a.p.localeCompare(b.p));
  return { rec: rec.recommended.platform, conf: rec.confidence, scores: all };
}
function scoringFingerprint() {
  const matrix = SCENARIOS.map((s) => ({
    name: s.name,
    out: project(recommend({ blueprint: s.bp, blueprintId: 'fp', blueprintVersion: 1, monthlyRuns: s.runs })),
  }));
  return createHash('sha256').update(stableStringify(matrix)).digest('hex');
}

describe('engine version guard', () => {
  it('ENGINE_VERSION matches the pinned value (bump it when scoring changes)', () => {
    expect(ENGINE_VERSION).toBe(EXPECTED_ENGINE_VERSION);
  });

  it('scoring output is unchanged — otherwise BUMP ENGINE_VERSION and update the fingerprint', () => {
    const actual = scoringFingerprint();
    expect(
      actual,
      `\n\n  Scoring output changed.\n` +
      `  If this change is intentional:\n` +
      `    1. Bump ENGINE_VERSION in lib/services/recommendation/recommendationEngine.js` +
      ` (e.g. '${EXPECTED_ENGINE_VERSION}' → next version).\n` +
      `    2. Set EXPECTED_ENGINE_VERSION + EXPECTED_SCORING_FINGERPRINT in this test to:\n` +
      `       ENGINE_VERSION       = <the new version>\n` +
      `       SCORING_FINGERPRINT  = '${actual}'\n` +
      `  This keeps persisted recommendations attributable to the rules that produced them.\n`
    ).toBe(EXPECTED_SCORING_FINGERPRINT);
  });
});
