import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const repo = await import('../lib/services/recommendation/recommendationRepository.js');

const rec = (over = {}) => ({
  recommended: { platform: 'n8n_cloud' }, confidence: 'high', engine: 'rules-v1', ...over,
});

describe('saveRecommendation — persist with timestamp + input version', () => {
  beforeEach(() => query.mockReset());

  it('inserts a new run when nothing exists', async () => {
    query
      .mockResolvedValueOnce([[]])   // no latest
      .mockResolvedValueOnce([{}]);  // insert
    const r = await repo.saveRecommendation({
      blueprintId: 'bp1', blueprintVersion: 3, userId: 'u1', recommendation: rec(),
      monthlyRuns: 5000, generatedAt: new Date('2026-07-28T00:00:00Z'),
    });
    expect(r.stored).toBe(true);
    expect(r.generated_at).toBe('2026-07-28T00:00:00.000Z');
    // The INSERT carries blueprint_version + input volume + engine version.
    const insertParams = query.mock.calls[1][1];
    expect(insertParams).toContain(3);            // blueprint_version
    expect(insertParams).toContain(5000);         // monthly_runs (input)
    expect(insertParams).toContain('rules-v1');   // engine_version
    expect(insertParams).toContain('n8n_cloud');  // recommended_platform
  });

  it('does NOT insert a duplicate when the latest run is identical in content', async () => {
    query.mockResolvedValueOnce([[{ id: 'existing', generated_at: new Date('2026-07-27T00:00:00Z'), recommendation_hash: repo.recommendationHash(rec()) }]]);
    const r = await repo.saveRecommendation({ blueprintId: 'bp1', blueprintVersion: 3, recommendation: rec() });
    expect(r.stored).toBe(false);
    expect(r.id).toBe('existing');
    expect(query).toHaveBeenCalledTimes(1); // only the lookup, no insert
  });

  it('inserts a new run when reasoning/risks CHANGE even if platform + confidence stay the same', async () => {
    // The reviewer's exact case: recommended platform + confidence unchanged, but
    // the reasoning differs — coarse field matching would MISS this; the content
    // hash catches it.
    const prev = rec({ reasoning: ['old reason'], risks: [] });
    const next = rec({ reasoning: ['a materially NEW reason'], risks: ['new risk'] });
    query
      .mockResolvedValueOnce([[{ id: 'old', generated_at: new Date(), recommendation_hash: repo.recommendationHash(prev) }]])
      .mockResolvedValueOnce([{}]);
    const r = await repo.saveRecommendation({ blueprintId: 'bp1', blueprintVersion: 3, recommendation: next });
    expect(r.stored).toBe(true);        // content changed → distinct run
    expect(query).toHaveBeenCalledTimes(2); // lookup + insert
  });

  it('inserts a new run when only the volume (monthly_runs) differs', async () => {
    query
      .mockResolvedValueOnce([[{ id: 'old', generated_at: new Date(), recommendation_hash: repo.recommendationHash(rec(), 5000) }]])
      .mockResolvedValueOnce([{}]);
    const r = await repo.saveRecommendation({ blueprintId: 'bp1', blueprintVersion: 3, recommendation: rec(), monthlyRuns: 10000 });
    expect(r.stored).toBe(true);        // different input → distinct run
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('stays idempotent when both content and monthly_runs match', async () => {
    query.mockResolvedValueOnce([[{ id: 'existing', generated_at: new Date(), recommendation_hash: repo.recommendationHash(rec(), 5000) }]]);
    const r = await repo.saveRecommendation({ blueprintId: 'bp1', blueprintVersion: 3, recommendation: rec(), monthlyRuns: 5000 });
    expect(r.stored).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('the hash is order-independent (property order cannot fork the fingerprint)', async () => {
    const a = { recommended: { platform: 'n8n_cloud', export_platform: 'n8n' }, confidence: 'high', reasoning: ['x', 'y'] };
    const b = { reasoning: ['x', 'y'], confidence: 'high', recommended: { export_platform: 'n8n', platform: 'n8n_cloud' } };
    expect(repo.recommendationHash(a)).toBe(repo.recommendationHash(b));
  });

  it('the hash ignores volatile fields (generated_at / recommendation_id)', async () => {
    const base = rec();
    expect(repo.recommendationHash({ ...base, generated_at: '2026-01-01', recommendation_id: 'r1' }))
      .toBe(repo.recommendationHash({ ...base, generated_at: '2030-12-31', recommendation_id: 'r2' }));
  });

  it('requires the core inputs', async () => {
    await expect(repo.saveRecommendation({ recommendation: rec() })).rejects.toThrow(/required/);
  });
});

describe('getRecommendationByInput — exact input, not just the latest run', () => {
  beforeEach(() => query.mockReset());

  it('queries by (blueprint, version, engine, monthly_runs) with a null-safe volume match', async () => {
    query.mockResolvedValueOnce([[{
      id: 'r5000', blueprint_id: 'bp1', blueprint_version: 3, engine_version: 'rules-v1',
      monthly_runs: 5000, generated_at: new Date('2026-07-28T00:00:00Z'),
      recommendation_json: JSON.stringify({ recommended: { platform: 'n8n_cloud' } }),
    }]]);
    // Latest run on file might be the 10000 one, but we ask for the 5000 input.
    const r = await repo.getRecommendationByInput('bp1', 3, 'rules-v1', 5000);
    expect(r.id).toBe('r5000');
    const sql = query.mock.calls[0][0];
    const args = query.mock.calls[0][1];
    expect(sql).toMatch(/monthly_runs <=> \?/);   // null-safe equality
    expect(sql).toMatch(/engine_version = \?/);
    expect(args).toEqual(['bp1', 3, 'rules-v1', 5000]);
  });

  it('passes NULL through for an absent volume override', async () => {
    query.mockResolvedValueOnce([[]]);
    await repo.getRecommendationByInput('bp1', 3, 'rules-v1', null);
    expect(query.mock.calls[0][1]).toEqual(['bp1', 3, 'rules-v1', null]);
  });

  it('returns null when no run matches that exact input', async () => {
    query.mockResolvedValueOnce([[]]);
    expect(await repo.getRecommendationByInput('bp1', 3, 'rules-v1', 5000)).toBeNull();
  });
});

describe('getLatestRecommendation / getRecommendationById', () => {
  beforeEach(() => query.mockReset());

  it('returns the latest run with parsed recommendation + ISO timestamp', async () => {
    query.mockResolvedValueOnce([[{
      id: 'r1', blueprint_id: 'bp1', blueprint_version: 3, recommended_platform: 'n8n_cloud',
      confidence: 'high', engine_version: 'rules-v1', generated_at: new Date('2026-07-28T00:00:00Z'),
      recommendation_json: JSON.stringify({ recommended: { platform: 'n8n_cloud' } }),
    }]]);
    const r = await repo.getLatestRecommendation('bp1', 3);
    expect(r.id).toBe('r1');
    expect(r.generated_at).toBe('2026-07-28T00:00:00.000Z');
    expect(r.recommendation.recommended.platform).toBe('n8n_cloud');
  });

  it('returns null when no run exists', async () => {
    query.mockResolvedValueOnce([[]]);
    expect(await repo.getRecommendationById('nope')).toBeNull();
  });
});
