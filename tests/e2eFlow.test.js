import { describe, it, expect, vi, beforeEach } from 'vitest';
import { baseBlueprint } from './fixtures.js';

/**
 * End-to-end user flow (pre-beta gate #7):
 *   Blueprint → Recommendation → Cost → Export → Report
 *
 * Runs the whole product pipeline OFFLINE — the DB pool is mocked and no LLM is
 * called — so it's deterministic and safe for CI. It proves the stages chain:
 * the recommended platform is the one that gets costed, the export provenance
 * records against, and the report headlines. With no prices in the (empty)
 * mock DB, it also proves the honesty-first path: unknown costs stay unknown,
 * never fabricated, and the flow still completes.
 */

// One mock pool for every DB-backed stage. SELECTs → empty; INSERTs → ok.
const query = vi.fn(async (sql) => (/^\s*insert/i.test(sql) ? [{}] : [[]]));
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));

const { recommend } = await import('../lib/services/recommendation/recommendationEngine.js');
const { buildCostEstimate } = await import('../lib/services/cost/costEstimate.js');
const { buildCostComparison } = await import('../lib/services/cost/costComparison.js');
const { recordExportRun } = await import('../lib/services/recommendation/exportRunRepository.js');
const { generateBlueprintReport } = await import('../lib/services/report/blueprintReport.js');

const BP_ID = 'e2e-bp';
const BP_VER = 3;
const RUNS = 5000;

describe('E2E — Blueprint → Recommendation → Cost → Export → Report', () => {
  beforeEach(() => query.mockClear());

  it('runs the full flow and keeps the chosen platform consistent across every stage', async () => {
    const blueprint = baseBlueprint();

    // ── 1. RECOMMENDATION ──────────────────────────────────────────────────
    const rec = recommend({ blueprint, blueprintId: BP_ID, blueprintVersion: BP_VER, monthlyRuns: RUNS });
    expect(rec.recommended?.platform).toBeTruthy();
    expect(rec.alternatives.length).toBeGreaterThanOrEqual(1);
    expect(['unknown', 'low', 'medium', 'high']).toContain(rec.confidence);
    const chosen = rec.recommended.export_platform;      // what an export would build
    expect(chosen).toBeTruthy();

    // ── 2. COST (single platform + comparison) ─────────────────────────────
    const estimate = await buildCostEstimate({ blueprint, platform: chosen, monthlyRuns: RUNS, blueprintId: BP_ID, blueprintVersion: BP_VER });
    expect(Array.isArray(estimate.cost_components)).toBe(true);
    expect(estimate.currency).toBe('USD');
    // Honesty-first: with no prices in the mock DB, no total is invented.
    expect(estimate.estimated_total).toBeNull();
    expect(estimate.unknowns.length).toBeGreaterThan(0);

    const comparison = await buildCostComparison({ blueprint, blueprintId: BP_ID, blueprintVersion: BP_VER, monthlyRuns: RUNS });
    expect(comparison.platforms.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(comparison.tradeoffs)).toBe(true);   // vendor-neutral framing present

    // ── 3. EXPORT provenance — following the recommendation ────────────────
    const followed = await recordExportRun({
      blueprintId: BP_ID, blueprintVersion: BP_VER, userId: 'u1', selectedPlatform: chosen, kind: 'workflow',
      recommendation: { id: 'rec-1', export_platform: chosen, recommended_platform: rec.recommended.platform },
    });
    expect(followed.is_recommendation_override).toBe(0);     // built what we recommended
    expect(followed.override_reason).toBeNull();

    // ── 3b. EXPORT provenance — user overrides to a different platform ─────
    const other = ['n8n', 'make', 'zapier', 'claude'].find((p) => p !== chosen);
    const overridden = await recordExportRun({
      blueprintId: BP_ID, blueprintVersion: BP_VER, selectedPlatform: other, kind: 'workflow',
      recommendation: { id: 'rec-1', export_platform: chosen, recommended_platform: rec.recommended.platform },
    });
    expect(overridden.is_recommendation_override).toBe(1);   // the product override signal
    expect(overridden.override_reason).toBe('user_selected_platform');

    // ── 4. REPORT — composes recommendation + cost + tools ─────────────────
    const report = await generateBlueprintReport({ blueprint, blueprintId: BP_ID, blueprintVersion: BP_VER, monthlyRuns: RUNS });
    expect(report.sections.recommended_architecture).toBeTruthy();
    expect(report.sections.cost_comparison).toBeTruthy();
    expect(report.confidence).toBe(rec.confidence);          // report echoes the engine's confidence

    // ── CHAIN INTEGRITY: the SAME platform flows Recommendation → Report ───
    const reportPlatform = JSON.stringify(report.sections.recommended_architecture).toLowerCase();
    expect(reportPlatform).toContain(chosen.toLowerCase());  // report headlines the recommended platform
  });

  it('completes even when the Blueprint is minimal (no crash across the pipeline)', async () => {
    const bp = baseBlueprint({ business_rules: [], process_steps: [{ step_id: 's1', sequence: 1, action: 'recv', action_type: 'receive_data' }] });
    const rec = recommend({ blueprint: bp, blueprintId: BP_ID, blueprintVersion: 1 });
    const report = await generateBlueprintReport({ blueprint: bp, blueprintId: BP_ID, blueprintVersion: 1 });
    expect(rec.recommended.platform).toBeTruthy();
    expect(Object.keys(report.sections).length).toBeGreaterThan(5);
  });
});
