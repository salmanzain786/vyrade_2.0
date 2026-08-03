import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const { importVerdicts, failureSummary, recentFailures } = await import('../lib/services/admin/adminFailuresRepository.js');

describe('importVerdicts', () => {
  beforeEach(() => query.mockReset());
  it('buckets import_check verdicts, defaulting missing to unknown', async () => {
    query.mockResolvedValueOnce([[
      { verdict: 'verified', n: 4 }, { verdict: 'skipped', n: 1 }, { verdict: 'unknown', n: 6 },
    ]]);
    const v = await importVerdicts();
    expect(v).toEqual({ verified: 4, skipped: 1, failed: 0, unknown: 6 });
    expect(query.mock.calls[0][0]).toMatch(/meta\.import_check/);
  });
});

describe('failureSummary', () => {
  beforeEach(() => query.mockReset());
  it('computes counts + import failure rate over the window', async () => {
    query.mockResolvedValueOnce([[
      { event_type: 'workflow_generated', n: 20 },
      { event_type: 'import_failed', n: 5 },
      { event_type: 'generation_failed', n: 2 },
      { event_type: 'repair_performed', n: 8 },
    ]]);
    const s = await failureSummary({ days: 30 });
    expect(s.generated).toBe(20);
    expect(s.import_failed).toBe(5);
    expect(s.generation_failed).toBe(2);
    expect(s.import_failure_rate).toBe(25); // 5/20
    expect(query.mock.calls[0][1]).toEqual([30]);
  });
  it('null failure rate when nothing generated', async () => {
    query.mockResolvedValueOnce([[]]);
    expect((await failureSummary({})).import_failure_rate).toBeNull();
  });
});

describe('recentFailures', () => {
  beforeEach(() => query.mockReset());
  it('only surfaces generation/import failures, paginated, joined to owner', async () => {
    query
      .mockResolvedValueOnce([[{ total: 3 }]])
      .mockResolvedValueOnce([[{
        id: 1, event_type: 'import_failed', platform: 'n8n', node_type: 'n8n-nodes-base.httpRequest',
        error_category: 'auth', severity: 'error', created_at: new Date(), blueprint_id: 'bp1',
        user_email: 'a@b.com', blueprint_name: 'Payroll',
      }]]);
    const r = await recentFailures({ days: 30, page: 1 });
    const [countSql] = query.mock.calls[0];
    expect(countSql).toMatch(/event_type IN \('generation_failed','import_failed'\)/);
    expect(r.total).toBe(3);
    expect(r.rows[0]).toMatchObject({ type: 'import_failed', node_type: 'n8n-nodes-base.httpRequest', user_email: 'a@b.com', blueprint_name: 'Payroll' });
  });

  it('clamps page size into LIMIT/OFFSET', async () => {
    query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    await recentFailures({ page: 2, pageSize: 5000 });
    expect(query.mock.calls[1][0]).toMatch(/LIMIT 200 OFFSET 200/);
  });
});
