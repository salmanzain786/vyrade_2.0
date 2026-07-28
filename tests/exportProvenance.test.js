import { describe, it, expect, vi, beforeEach } from 'vitest';
import { baseBlueprint } from './fixtures.js';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));

const { ensureRecommendation } = await import('../lib/services/recommendation/recommendationRepository.js');
const { recordExportRun } = await import('../lib/services/recommendation/exportRunRepository.js');

describe('ensureRecommendation — architecture-first guarantee', () => {
  beforeEach(() => query.mockReset());

  it('returns the existing recommendation without recomputing', async () => {
    query.mockResolvedValueOnce([[{
      id: 'existing', blueprint_id: 'bp1', blueprint_version: 3, recommended_platform: 'n8n_cloud',
      confidence: 'high', engine_version: 'rules-v1', generated_at: new Date(),
      recommendation_json: JSON.stringify({ recommended: { platform: 'n8n_cloud', export_platform: 'n8n' } }),
    }]]);
    const r = await ensureRecommendation({ blueprintId: 'bp1', blueprintVersion: 3, blueprint: baseBlueprint() });
    expect(r.id).toBe('existing');
    expect(r.export_platform).toBe('n8n');
    expect(query).toHaveBeenCalledTimes(1); // only the lookup — no compute/save
  });

  it('computes AND persists a recommendation when none exists', async () => {
    query
      .mockResolvedValueOnce([[]])   // getLatestRecommendation → none
      .mockResolvedValueOnce([[]])   // saveRecommendation: latest lookup → none
      .mockResolvedValueOnce([{}]);  // saveRecommendation: INSERT
    const r = await ensureRecommendation({ blueprintId: 'bp1', blueprintVersion: 3, userId: 'u1', blueprint: baseBlueprint() });
    expect(r.id).toBeTruthy();               // a new run was stored
    expect(r.export_platform).toBeTruthy();  // a real platform was recommended
    expect(query).toHaveBeenCalledTimes(3);  // lookup + save-lookup + insert
  });
});

describe('recordExportRun — export provenance stamp', () => {
  beforeEach(() => query.mockReset().mockResolvedValue([{}]));

  it('marks followed_recommendation=1 when the built platform matches the recommendation', async () => {
    await recordExportRun({
      blueprintId: 'bp1', blueprintVersion: 3, userId: 'u1', selectedPlatform: 'n8n', kind: 'workflow',
      recommendation: { id: 'r1', export_platform: 'n8n', recommended_platform: 'n8n_cloud' },
    });
    const params = query.mock.calls[0][1];
    expect(params).toContain('r1');   // recommendation_id stamped
    expect(params).toContain('n8n');  // selected platform
    expect(params[8]).toBe(1);        // followed_recommendation
  });

  it('marks followed_recommendation=0 when the user built off-recommendation', async () => {
    await recordExportRun({
      blueprintId: 'bp1', blueprintVersion: 3, selectedPlatform: 'zapier', kind: 'guide',
      recommendation: { id: 'r1', export_platform: 'n8n', recommended_platform: 'n8n_cloud' },
    });
    expect(query.mock.calls[0][1][8]).toBe(0);
  });

  it('followed_recommendation is null when no recommendation is available', async () => {
    await recordExportRun({ blueprintId: 'bp1', blueprintVersion: 3, selectedPlatform: 'n8n', recommendation: null });
    expect(query.mock.calls[0][1][8]).toBeNull();
  });

  it('never throws on a DB error', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(recordExportRun({ blueprintId: 'bp1', selectedPlatform: 'n8n' })).resolves.toBeNull();
  });
});
