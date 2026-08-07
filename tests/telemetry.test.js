import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const { recordExecutionEvent, executionMetrics, resolveToken, revokeToken, listTokens, measuredHoursSavedForUser, measuredHoursForBlueprint } = await import('../lib/services/telemetry/telemetryRepository.js');

describe('telemetry ingestion (4.1) — privacy + normalisation', () => {
  beforeEach(() => query.mockReset());

  it('validates the blueprint belongs to the user, then inserts', async () => {
    query.mockResolvedValueOnce([[{ id: 'bp1' }]]) // ownership check → owned
      .mockResolvedValueOnce([{}]);                 // insert
    await recordExecutionEvent({ userId: 'u1', blueprintId: 'bp1', status: 'success', durationMs: 1200 });
    const insert = query.mock.calls[1];
    expect(insert[0]).toMatch(/INSERT INTO execution_events/i);
    expect(insert[1]).toContain('bp1');
  });

  it('drops an unowned blueprint_id to null (no cross-user attribution)', async () => {
    query.mockResolvedValueOnce([[]])  // ownership check → not owned
      .mockResolvedValueOnce([{}]);
    await recordExecutionEvent({ userId: 'u1', blueprintId: 'someone-elses', status: 'success' });
    expect(query.mock.calls[1][1][0]).toBeNull(); // blueprint_id param is null
  });

  it('categorises a raw error and NEVER stores the raw message', async () => {
    query.mockResolvedValueOnce([{}]); // insert (no blueprint id → no ownership query)
    const r = await recordExecutionEvent({ userId: 'u1', status: 'error', rawError: 'Request failed: ECONNREFUSED to api.example.com' });
    expect(r.error_category).toBe('unreachable');           // coarse category
    const params = query.mock.calls[0][1];
    expect(params.join(' ')).not.toMatch(/example\.com/);   // raw message not persisted
  });

  it('normalises odd status strings', async () => {
    query.mockResolvedValueOnce([{}]);
    const r = await recordExecutionEvent({ userId: 'u1', status: 'CRASHED' });
    expect(r.status).toBe('error');
  });
});

describe('reliability metrics (4.2/4.3)', () => {
  beforeEach(() => query.mockReset());

  it('computes success/failure/intervention rates + measured monthly runs', async () => {
    query.mockResolvedValueOnce([[{ total: 100, success: 92, error: 8, waiting: 0, avg_ms: 1500, interventions: 5 }]])
      .mockResolvedValueOnce([[{ error_category: 'unreachable', n: 6 }, { error_category: 'credential_issue', n: 2 }]]);
    const m = await executionMetrics('bp1', { days: 30 });
    expect(m.has_data).toBe(true);
    expect(m.success_rate).toBe(92);
    expect(m.failure_rate).toBe(8);
    expect(m.intervention_rate).toBe(5);
    expect(m.measured_monthly_runs).toBe(100); // 100 over 30d → ~100/mo
    expect(m.by_error[0]).toEqual({ category: 'unreachable', count: 6 });
  });

  it('extrapolates monthly runs from a shorter window', async () => {
    query.mockResolvedValueOnce([[{ total: 70, success: 70, error: 0, waiting: 0, avg_ms: 900, interventions: 0 }]])
      .mockResolvedValueOnce([[]]);
    const m = await executionMetrics('bp1', { days: 7 });
    expect(m.measured_monthly_runs).toBe(300); // 70 over 7d → 300/mo
  });

  it('reports no data cleanly for an unconnected blueprint', async () => {
    query.mockResolvedValueOnce([[{ total: 0, success: 0, error: 0, waiting: 0, avg_ms: null, interventions: 0 }]]).mockResolvedValueOnce([[]]);
    const m = await executionMetrics('bp1', {});
    expect(m.has_data).toBe(false);
    expect(m.success_rate).toBeNull();
  });
});

describe('4.4 — telemetry-derived hours saved (rate × measured volume)', () => {
  beforeEach(() => query.mockReset());

  it('measuredHoursForBlueprint = rate × measured runs / 60', () => {
    expect(measuredHoursForBlueprint({ minutesPerRun: 6, measuredMonthlyRuns: 300 })).toBe(30); // 6min × 300 / 60
    expect(measuredHoursForBlueprint({ minutesPerRun: null, measuredMonthlyRuns: 300 })).toBeNull();
    expect(measuredHoursForBlueprint({ minutesPerRun: 6, measuredMonthlyRuns: 0 })).toBeNull();
  });

  it('measuredHoursSavedForUser sums real volume × rate, extrapolated to a month', async () => {
    // Two automations: 70 runs/7d @ 6min (→300/mo → 30h) and 30 runs/7d @ 10min (→~128.5/mo → ~21h)
    query.mockResolvedValueOnce([[
      { blueprint_id: 'b1', minutes_saved_per_run: 6, runs: 70 },
      { blueprint_id: 'b2', minutes_saved_per_run: 10, runs: 30 },
    ]]);
    const m = await measuredHoursSavedForUser('u1', { days: 7 });
    expect(m.has_measured).toBe(true);
    expect(m.blueprints).toBe(2);
    // 300/mo×6/60=30 ; (30*30/7)=128.57/mo×10/60=21.43 → round total 51
    expect(m.hours_month).toBe(51);
  });

  it('ignores automations with a rate but zero measured runs (no phantom hours)', async () => {
    query.mockResolvedValueOnce([[{ blueprint_id: 'b1', minutes_saved_per_run: 6, runs: 0 }]]);
    const m = await measuredHoursSavedForUser('u1', { days: 30 });
    expect(m.has_measured).toBe(false);
    expect(m.hours_month).toBe(0);
  });
});

describe('tokens — masking + revoke by hint', () => {
  beforeEach(() => query.mockReset());

  it('resolveToken returns null for an invalid/revoked token', async () => {
    query.mockResolvedValueOnce([[]]);
    expect(await resolveToken('bad')).toBeNull();
  });

  it('listTokens exposes only a masked hint, never the full secret', async () => {
    query.mockResolvedValueOnce([[{ token: 'abcdef0123456789'.repeat(4), label: 'Prod', revoked: 0, last_used_at: null, created_at: new Date() }]]);
    const rows = await listTokens('u1');
    expect(rows[0].token).toBeUndefined();
    expect(rows[0].token_hint).toMatch(/^abcdef01…6789$/);
  });

  it('revoke by masked hint matches on prefix+suffix, scoped to the user', async () => {
    query.mockResolvedValueOnce([{}]);
    await revokeToken({ userId: 'u1', token: 'abcdef01…6789' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/LEFT\(token, \?\) = \? AND RIGHT\(token, \?\) = \?/);
    expect(params).toEqual(['u1', 8, 'abcdef01', 4, '6789']);
  });
});
