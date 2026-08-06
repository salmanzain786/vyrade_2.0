import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const { setResolution, getResolutions, getLastTwoScans, markFindingsResolved } = await import('../lib/services/scanner/scanRepository.js');

describe('resolution tracking (7.2)', () => {
  beforeEach(() => query.mockReset());

  it('upserts a resolution keyed by type::node', async () => {
    query.mockResolvedValueOnce([{}]);
    const r = await setResolution({ blueprintId: 'bp1', findingType: 'insecure_http', node: 'A', status: 'resolved', userId: 'u1' });
    expect(r.findingKey).toBe('insecure_http::A');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO finding_resolutions/i);
    expect(params).toContain('insecure_http::A');
    expect(params).toContain('resolved');
  });

  it('marking a finding back to "open" DELETES the row (keeps table lean)', async () => {
    query.mockResolvedValueOnce([{}]);
    await setResolution({ blueprintId: 'bp1', findingType: 'insecure_http', node: 'A', status: 'open' });
    expect(query.mock.calls[0][0]).toMatch(/DELETE FROM finding_resolutions/i);
  });

  it('rejects an invalid status', async () => {
    await expect(setResolution({ blueprintId: 'bp1', findingType: 'x', status: 'bogus' })).rejects.toThrow(/Invalid status/);
  });

  it('getResolutions returns a map keyed by finding_key', async () => {
    query.mockResolvedValueOnce([[
      { finding_key: 'insecure_http::A', finding_type: 'insecure_http', node: 'A', status: 'resolved', note: null, updated_at: new Date() },
    ]]);
    const map = await getResolutions('bp1');
    expect(map['insecure_http::A'].status).toBe('resolved');
  });

  it('markFindingsResolved upserts every diff-resolved finding as "resolved" (7.2↔7.3 link)', async () => {
    query.mockResolvedValue([{}]);
    const n = await markFindingsResolved({
      blueprintId: 'bp1', userId: 'u1', note: 'Auto-resolved by regeneration (scan #42)',
      findings: [{ type: 'missing_error_handling', node: null }, { type: 'insecure_http', node: 'A' }],
    });
    expect(n).toBe(2);
    expect(query).toHaveBeenCalledTimes(2);
    const allParams = query.mock.calls.flatMap((c) => c[1]);
    expect(allParams).toContain('resolved');
    expect(allParams).toContain('missing_error_handling::');
    expect(allParams).toContain('insecure_http::A');
    expect(allParams).toContain('Auto-resolved by regeneration (scan #42)');
  });

  it('markFindingsResolved is best-effort — one failure does not abort the batch', async () => {
    query.mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce([{}]);
    const n = await markFindingsResolved({ blueprintId: 'bp1', findings: [{ type: 'a', node: null }, { type: 'b', node: null }] });
    expect(n).toBe(1); // the second succeeded
  });

  it('getLastTwoScans parses findings for the before/after diff', async () => {
    query.mockResolvedValueOnce([[
      { readiness_pct: 70, security_risk_level: 'Medium', findings_json: JSON.stringify([{ type: 'a' }]), created_at: new Date() },
      { readiness_pct: 50, security_risk_level: 'High', findings_json: JSON.stringify([{ type: 'b' }]), created_at: new Date() },
    ]]);
    const two = await getLastTwoScans('bp1');
    expect(two).toHaveLength(2);
    expect(two[0].findings[0].type).toBe('a');
    expect(two[1].security_risk_level).toBe('High');
  });
});
