import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const { costSummary, perUserSpend, authBlocks } = await import('../lib/services/admin/adminCostRepository.js');

describe('costSummary', () => {
  beforeEach(() => query.mockReset());
  it('computes totals + mean per user', async () => {
    query.mockResolvedValueOnce([[{ cost: '12.40', tokens: '412000', users: 4 }]]);
    const s = await costSummary({ days: 30 });
    expect(s.total_cost).toBeCloseTo(12.4);
    expect(s.total_tokens).toBe(412000);
    expect(s.users).toBe(4);
    expect(s.mean_cost).toBeCloseTo(3.1);
  });
  it('mean is 0 when there are no users (no divide-by-zero)', async () => {
    query.mockResolvedValueOnce([[{ cost: null, tokens: null, users: 0 }]]);
    expect((await costSummary({})).mean_cost).toBe(0);
  });
});

describe('perUserSpend — spike flagging', () => {
  beforeEach(() => query.mockReset());
  it('flags a user well above mean, not a small spender', async () => {
    query
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([[
        { user_id: 'u1', email: 'big@x.com', name: 'Big', convos: 8, cost: '6.20', tokens: '412000', last_activity: new Date() },
        { user_id: 'u2', email: 'small@x.com', name: 'Small', convos: 1, cost: '0.10', tokens: '5000', last_activity: new Date() },
      ]]);
    const r = await perUserSpend({ days: 30, meanCost: 1.0 }); // spikeFloor = max(0.5, 2.0) = 2.0
    expect(r.rows.find((u) => u.user_id === 'u1').spike).toBe(true);
    expect(r.rows.find((u) => u.user_id === 'u2').spike).toBe(false);
  });
  it('clamps page size into LIMIT/OFFSET', async () => {
    query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]]);
    await perUserSpend({ page: 2, pageSize: 9000 });
    expect(query.mock.calls[1][0]).toMatch(/LIMIT 200 OFFSET 200/);
  });
});

describe('authBlocks', () => {
  beforeEach(() => query.mockReset());
  it('counts blocked + failed and lists top blocked', async () => {
    query
      .mockResolvedValueOnce([[{ blocked: '3', failed: '9' }]])
      .mockResolvedValueOnce([[{ who: '1.2.3.4', n: '3', last: new Date() }]]);
    const a = await authBlocks({ days: 30 });
    expect(a.blocked).toBe(3);
    expect(a.failed_logins).toBe(9);
    expect(a.top_blocked[0]).toMatchObject({ who: '1.2.3.4', count: 3 });
    expect(query.mock.calls[1][0]).toMatch(/outcome = 'blocked'/);
  });
});
