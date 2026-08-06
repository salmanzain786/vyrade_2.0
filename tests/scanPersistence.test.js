import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const { saveScan, getScanHistory, getLatestScan } = await import('../lib/services/scanner/scanRepository.js');

const result = {
  platform: 'n8n', workflow_name: 'Lead intake', node_count: 19,
  summary: { total: 16, worst_severity: 'high', manual_review_count: 3 },
  findings: [{ type: 'pii_detected', severity: 'high' }],
  framework_mapping: { frameworks: [] },
  report: { overall: { governance_readiness_pct: 70, readiness_band: 'Moderate', security_risk_level: 'High' } },
};
const ctx = { platform: 'n8n', versionCount: 4, workflow: {} };

describe('saveScan', () => {
  beforeEach(() => query.mockReset());

  it('inserts a denormalised snapshot and returns the new id', async () => {
    query.mockResolvedValueOnce([{ insertId: 42 }]);
    const id = await saveScan({ blueprintId: 'bp1', userId: 'u1', ctx, result });
    expect(id).toBe(42);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO governance_scans/i);
    // headline metrics pulled from the report/summary
    expect(params).toContain('bp1');
    expect(params).toContain(70);          // readiness_pct
    expect(params).toContain('High');      // security_risk_level
    expect(params).toContain(16);          // findings_total
    expect(params).toContain(1);           // had_workflow (ctx.workflow present)
  });

  it('never throws on a DB error — persistence is best-effort', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    const id = await saveScan({ blueprintId: 'bp1', ctx, result });
    expect(id).toBeNull();
  });

  it('records had_workflow=0 for a controls-only scan', async () => {
    query.mockResolvedValueOnce([{ insertId: 7 }]);
    await saveScan({ blueprintId: 'bp1', ctx: { platform: 'n8n', versionCount: 2, workflow: null }, result: { ...result, node_count: 0 } });
    expect(query.mock.calls[0][1]).toContain(0); // had_workflow
  });
});

describe('getScanHistory', () => {
  beforeEach(() => query.mockReset());
  it('returns compact metric rows, newest first', async () => {
    query.mockResolvedValueOnce([[
      { id: 2, blueprint_id: 'bp1', platform: 'n8n', readiness_pct: 70, security_risk_level: 'High', findings_total: 16, had_workflow: 1, created_at: new Date() },
      { id: 1, blueprint_id: 'bp1', platform: 'n8n', readiness_pct: 55, security_risk_level: 'High', findings_total: 20, had_workflow: 1, created_at: new Date() },
    ]]);
    const h = await getScanHistory('bp1', 12);
    expect(h).toHaveLength(2);
    expect(h[0].readiness_pct).toBe(70);
    expect(h[0].had_workflow).toBe(true);
    expect(query.mock.calls[0][1]).toEqual(['bp1', 12]);
  });
});

describe('getLatestScan', () => {
  beforeEach(() => query.mockReset());
  it('parses the JSON snapshot columns', async () => {
    query.mockResolvedValueOnce([[{
      id: 5, blueprint_id: 'bp1', platform: 'n8n', readiness_pct: 70, findings_total: 16, had_workflow: 1, created_at: new Date(),
      summary_json: JSON.stringify({ total: 16 }),
      findings_json: JSON.stringify([{ type: 'pii_detected' }]),
      report_json: JSON.stringify({ overall: { governance_readiness_pct: 70 } }),
      framework_json: JSON.stringify({ frameworks: [] }),
    }]]);
    const s = await getLatestScan('bp1');
    expect(s.report.overall.governance_readiness_pct).toBe(70);
    expect(s.findings[0].type).toBe('pii_detected');
    expect(s.summary.total).toBe(16);
  });

  it('returns null when there is no scan yet', async () => {
    query.mockResolvedValueOnce([[]]);
    expect(await getLatestScan('bp1')).toBeNull();
  });
});
