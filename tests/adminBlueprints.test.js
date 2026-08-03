import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const { listBlueprints, BLUEPRINT_STATUSES } = await import('../lib/services/admin/adminBlueprintsRepository.js');

// count query resolves first, then the rows query.
const mockCount = (n) => query.mockResolvedValueOnce([[{ total: n }]]);
const mockRows = (rows) => query.mockResolvedValueOnce([rows]);

describe('listBlueprints — admin overview query', () => {
  beforeEach(() => query.mockReset());

  it('maps rows and computes pagination', async () => {
    mockCount(3);
    mockRows([{ id: 'b1', status: 'blocked', version: 2, updated_at: new Date(), created_at: new Date(),
      user_email: 'a@b.com', user_name: 'A', name: 'Payroll', readiness_score: 92, blocking_count: 0 }]);
    const r = await listBlueprints({ page: 1, pageSize: 50 });
    expect(r.total).toBe(3);
    expect(r.pages).toBe(1);
    expect(r.rows[0]).toMatchObject({ id: 'b1', name: 'Payroll', readiness_score: 92, status: 'blocked' });
  });

  it('applies a status filter with a bound param', async () => {
    mockCount(0); mockRows([]);
    await listBlueprints({ status: 'requirements_complete' });
    const [countSql, countParams] = query.mock.calls[0];
    expect(countSql).toMatch(/b\.status = \?/);
    expect(countParams).toContain('requirements_complete');
  });

  it('ignores an unknown status (no injection of arbitrary filters)', async () => {
    mockCount(0); mockRows([]);
    await listBlueprints({ status: 'DROP TABLE' });
    expect(query.mock.calls[0][0]).not.toMatch(/b\.status = \?/);
    expect(query.mock.calls[0][1]).toEqual([]); // no params
  });

  it('search matches name OR user email with LIKE params', async () => {
    mockCount(0); mockRows([]);
    await listBlueprints({ search: 'lead' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/u\.email LIKE \?/);
    expect(sql).toMatch(/JSON_EXTRACT\(v\.blueprint_json, '\$\.name'\)\) LIKE \?/);
    expect(params).toEqual(['%lead%', '%lead%']);
  });

  it('clamps page size and computes offset via LIMIT/OFFSET (ints, not params)', async () => {
    mockCount(500); mockRows([]);
    const r = await listBlueprints({ page: 3, pageSize: 999 }); // 999 clamps to 200
    expect(r.pageSize).toBe(200);
    const rowsSql = query.mock.calls[1][0];
    expect(rowsSql).toMatch(/LIMIT 200 OFFSET 400/); // (3-1)*200
  });

  it('exposes the known status set', () => {
    expect(BLUEPRINT_STATUSES).toContain('requirements_complete');
    expect(BLUEPRINT_STATUSES).toContain('blocked');
  });
});
