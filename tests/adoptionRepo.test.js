import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const { recordAdoptionEvent, getStageReach } = await import('../lib/services/adoption/adoptionRepository.js');
const { seedOpportunitiesForProfile, opportunityCounts, setOpportunityStatus } = await import('../lib/services/adoption/opportunityRepository.js');

describe('adoption events (1.3)', () => {
  beforeEach(() => query.mockReset());

  it('records a valid stage', async () => {
    query.mockResolvedValueOnce([{}]);
    const ok = await recordAdoptionEvent({ userId: 'u1', stage: 'blueprint_started', blueprintId: 'b1' });
    expect(ok).toBe(true);
    expect(query.mock.calls[0][0]).toMatch(/INSERT INTO adoption_events/i);
  });

  it('rejects an invalid stage without touching the DB', async () => {
    const ok = await recordAdoptionEvent({ userId: 'u1', stage: 'not_a_stage' });
    expect(ok).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('is best-effort — a DB error never throws', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    expect(await recordAdoptionEvent({ userId: 'u1', stage: 'discovered' })).toBe(false);
  });

  it('getStageReach computes the furthest stage reached', async () => {
    query.mockResolvedValueOnce([[{ stage: 'discovered' }, { stage: 'blueprint_started' }, { stage: 'considered' }]]);
    const r = await getStageReach('u1');
    expect(r.furthest).toBe('blueprint_started'); // furthest along the 9-stage order
    expect(r.reached.has('discovered')).toBe(true);
  });
});

describe('opportunity map (1.2)', () => {
  beforeEach(() => query.mockReset());

  it('seeds from the profile with INSERT IGNORE (idempotent)', async () => {
    query.mockResolvedValueOnce([{ affectedRows: 9 }]);
    const n = await seedOpportunitiesForProfile('u1', { department: 'marketing' });
    expect(n).toBe(9);
    expect(query.mock.calls[0][0]).toMatch(/INSERT IGNORE INTO opportunity_map/i);
  });

  it('rejects an invalid opportunity status', async () => {
    await expect(setOpportunityStatus({ userId: 'u1', areaKey: 'x', status: 'bogus' })).rejects.toThrow(/Invalid/);
  });

  it('opportunityCounts derives engaged/addressed tallies', async () => {
    query.mockResolvedValueOnce([[
      { status: 'suggested', n: 5, hrs: 30 },
      { status: 'addressed', n: 2, hrs: 22 },
      { status: 'considered', n: 1, hrs: 8 },
    ]]);
    const c = await opportunityCounts('u1');
    expect(c.total).toBe(8);
    expect(c.addressed).toBe(2);
    expect(c.engaged).toBe(3);              // considered + addressed
    expect(c.addressed_hours_month).toBe(22);
  });
});
