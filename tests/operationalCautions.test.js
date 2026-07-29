import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectCautions, formatCautions, CURATED_CAUTIONS } from '../lib/services/insights/operationalCautions.js';

describe('selectCautions — keyed curated seed', () => {
  it('matches by integration name (both-ways substring, case-insensitive)', () => {
    const c = selectCautions({ tools: ['Slack', 'Google Sheets'], actionTypes: [] });
    const ids = c.map((x) => x.id);
    expect(ids).toContain('slack');
    expect(ids).toContain('gsheets');   // "Google Sheets" ↔ alias "sheets"
    expect(c.every((x) => x.source === 'curated')).toBe(true);
  });

  it('matches by action_type when no integration name does', () => {
    const c = selectCautions({ tools: ['SomeUnknownCRM'], actionTypes: ['ai_reasoning'] });
    expect(c.map((x) => x.id)).toContain('ai');   // ai caution is action-keyed
  });

  it('returns nothing for an unrelated blueprint', () => {
    expect(selectCautions({ tools: ['ObscureThing'], actionTypes: ['do_stuff'] })).toEqual([]);
  });

  it('does not double-list the same caution', () => {
    // Both a Postgres and a MySQL system map to the single "db" caution.
    const c = selectCautions({ tools: ['Postgres', 'MySQL'], actionTypes: [] });
    expect(c.filter((x) => x.id === 'db')).toHaveLength(1);
  });

  it('every curated caution carries a failure mode AND a fix', () => {
    for (const c of CURATED_CAUTIONS) {
      expect(c.caution && c.caution.length).toBeGreaterThan(10);
      expect(c.fix && c.fix.length).toBeGreaterThan(10);
      expect(c.aliases?.length || c.actions?.length).toBeTruthy();
    }
  });

  it('formats a prompt-ready block, and a friendly empty string', () => {
    const block = formatCautions(selectCautions({ tools: ['Stripe'], actionTypes: [] }));
    expect(block).toMatch(/Idempotency-Key/);
    expect(formatCautions([])).toMatch(/no known operational cautions/i);
  });
});

// ── Retrieval merges the curated seed with live telemetry ──────────────────
const docGaps = vi.fn();
const topFailingNodes = vi.fn();
vi.mock('../lib/services/insights/operationalInsightsRepository.js', () => ({
  docGaps: (...a) => docGaps(...a),
  topFailingNodes: (...a) => topFailingNodes(...a),
}));
const { retrieveOperationalCautions } = await import('../lib/services/insights/cautionRetrieval.js');

const bp = { systems: [{ name: 'Slack' }, { name: 'Airtable' }], process_steps: [{ action_type: 'ai_reasoning' }] };

describe('retrieveOperationalCautions — curated + telemetry loop', () => {
  beforeEach(() => { docGaps.mockReset(); topFailingNodes.mockReset(); });

  it('overlays telemetry signals that relate to the blueprint on top of curated ones', async () => {
    docGaps.mockResolvedValueOnce([{ tool: 'Airtable', gaps: 4 }, { tool: 'Unrelated', gaps: 9 }]);
    topFailingNodes.mockResolvedValueOnce([{ node_type: 'n8n-nodes-base.httpRequest', failures: 5 }]);
    const r = await retrieveOperationalCautions(bp);
    const ids = r.cautions.map((c) => c.id);
    expect(ids).toContain('slack');                         // curated
    expect(ids).toContain('ai');                            // curated (action)
    expect(ids).toContain('telemetry:docgap:airtable');     // telemetry, tool matches blueprint
    expect(ids).toContain('telemetry:failnode:httprequest');// telemetry, global failing node
    expect(ids).not.toContain('telemetry:docgap:unrelated');// unrelated tool filtered out
    expect(r.curatedCount).toBeGreaterThan(0);
    expect(r.telemetryCount).toBe(2);
  });

  it('ignores weak telemetry signals (below the threshold)', async () => {
    docGaps.mockResolvedValueOnce([{ tool: 'Airtable', gaps: 1 }]);          // < 2 → ignored
    topFailingNodes.mockResolvedValueOnce([{ node_type: 'x.foo', failures: 2 }]); // < 3 → ignored
    const r = await retrieveOperationalCautions(bp);
    expect(r.telemetryCount).toBe(0);
    expect(r.curatedCount).toBeGreaterThan(0);   // curated still present
  });

  it('degrades to the curated seed when telemetry queries fail (never throws)', async () => {
    docGaps.mockRejectedValueOnce(new Error('db down'));
    topFailingNodes.mockRejectedValueOnce(new Error('db down'));
    const r = await retrieveOperationalCautions(bp);
    expect(r.available).toBe(true);
    expect(r.telemetryCount).toBe(0);
    expect(r.cautions.length).toBeGreaterThan(0); // curated survived
  });
});
