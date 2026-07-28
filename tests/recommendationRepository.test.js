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

  it('does NOT insert a duplicate when the latest run is identical', async () => {
    query.mockResolvedValueOnce([[{ id: 'existing', generated_at: new Date('2026-07-27T00:00:00Z'), recommended_platform: 'n8n_cloud', confidence: 'high', engine_version: 'rules-v1' }]]);
    const r = await repo.saveRecommendation({ blueprintId: 'bp1', blueprintVersion: 3, recommendation: rec() });
    expect(r.stored).toBe(false);
    expect(r.id).toBe('existing');
    expect(query).toHaveBeenCalledTimes(1); // only the lookup, no insert
  });

  it('inserts a new run when the recommendation CHANGED', async () => {
    query
      .mockResolvedValueOnce([[{ id: 'old', generated_at: new Date(), recommended_platform: 'zapier', confidence: 'medium', engine_version: 'rules-v1' }]])
      .mockResolvedValueOnce([{}]);
    const r = await repo.saveRecommendation({ blueprintId: 'bp1', blueprintVersion: 3, recommendation: rec() });
    expect(r.stored).toBe(true);
    expect(query).toHaveBeenCalledTimes(2); // lookup + insert
  });

  it('inserts a new run when only the volume (monthly_runs) differs', async () => {
    query
      .mockResolvedValueOnce([[{ id: 'old', generated_at: new Date(), recommended_platform: 'n8n_cloud', confidence: 'high', engine_version: 'rules-v1', monthly_runs: 5000 }]])
      .mockResolvedValueOnce([{}]);
    const r = await repo.saveRecommendation({ blueprintId: 'bp1', blueprintVersion: 3, recommendation: rec(), monthlyRuns: 10000 });
    expect(r.stored).toBe(true);        // different input → distinct run
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('stays idempotent when monthly_runs also matches', async () => {
    query.mockResolvedValueOnce([[{ id: 'existing', generated_at: new Date(), recommended_platform: 'n8n_cloud', confidence: 'high', engine_version: 'rules-v1', monthly_runs: 5000 }]]);
    const r = await repo.saveRecommendation({ blueprintId: 'bp1', blueprintVersion: 3, recommendation: rec(), monthlyRuns: 5000 });
    expect(r.stored).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('requires the core inputs', async () => {
    await expect(repo.saveRecommendation({ recommendation: rec() })).rejects.toThrow(/required/);
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
