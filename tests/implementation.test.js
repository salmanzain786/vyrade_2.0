import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const recordAdoptionEvent = vi.fn();
vi.mock('../lib/services/adoption/adoptionRepository.js', () => ({ recordAdoptionEvent: (...a) => recordAdoptionEvent(...a) }));

const { confirmImplemented, setActive, reportOutcome, activeCountForUser } = await import('../lib/services/adoption/implementationRepository.js');

// getImplementation runs after each mutation → give it a row to read back.
const readback = (over = {}) => [[{ blueprint_id: 'b1', implemented: 1, active: 1, platform: 'n8n', measured: 0, ...over }]];

describe('implementation tracking (Phase 3)', () => {
  beforeEach(() => { query.mockReset(); recordAdoptionEvent.mockReset(); });

  it('3.1 confirmImplemented sets implemented+active and fires Implemented + Active events', async () => {
    query.mockResolvedValueOnce([{}]).mockResolvedValueOnce(readback());
    await confirmImplemented({ blueprintId: 'b1', userId: 'u1', platform: 'n8n', deployedAt: '2026-01-01', owner: 'ops@x.com' });
    expect(query.mock.calls[0][0]).toMatch(/INSERT INTO blueprint_implementations/i);
    const stages = recordAdoptionEvent.mock.calls.map((c) => c[0].stage);
    expect(stages).toEqual(['implemented', 'active']);
  });

  it('3.2 setActive(true) fires an Active event; setActive(false) does not', async () => {
    query.mockResolvedValue(readback());
    await setActive({ blueprintId: 'b1', userId: 'u1', active: true });
    expect(recordAdoptionEvent).toHaveBeenCalledWith(expect.objectContaining({ stage: 'active' }));
    recordAdoptionEvent.mockReset(); query.mockResolvedValue(readback({ active: 0 }));
    await setActive({ blueprintId: 'b1', userId: 'u1', active: false });
    expect(recordAdoptionEvent).not.toHaveBeenCalled();
  });

  it('3.3 reportOutcome with data sets measured + fires Measured; empty does not', async () => {
    query.mockResolvedValueOnce([{}]).mockResolvedValueOnce(readback({ measured: 1 }));
    await reportOutcome({ blueprintId: 'b1', userId: 'u1', usageVolume: 120, timeSavedHours: 8, notes: 'great' });
    // measured flag passed to the INSERT (last param group) is 1
    expect(query.mock.calls[0][1]).toContain(1);
    expect(recordAdoptionEvent).toHaveBeenCalledWith(expect.objectContaining({ stage: 'measured' }));

    recordAdoptionEvent.mockReset(); query.mockReset();
    query.mockResolvedValueOnce([{}]).mockResolvedValueOnce(readback());
    await reportOutcome({ blueprintId: 'b1', userId: 'u1' }); // no data
    expect(recordAdoptionEvent).not.toHaveBeenCalled();
  });

  it('sanitises numeric outcome inputs (negatives/floats/blank)', async () => {
    query.mockResolvedValueOnce([{}]).mockResolvedValueOnce(readback());
    await reportOutcome({ blueprintId: 'b1', userId: 'u1', usageVolume: '-5', timeSavedHours: '3.9', notes: '' });
    const params = query.mock.calls[0][1];
    expect(params).toContain(0); // -5 clamped to 0
    expect(params).toContain(3); // 3.9 truncated
  });

  it('activeCountForUser returns the active tally', async () => {
    query.mockResolvedValueOnce([[{ n: 2 }]]);
    expect(await activeCountForUser('u1')).toBe(2);
  });
});
