import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const listMembers = vi.fn();
vi.mock('../lib/services/org/membershipRepository.js', async (orig) => ({
  ...(await orig()),
  listMembers: (...a) => listMembers(...a),
}));

const { perMemberScores, departmentComparison, orgOpportunityMap, platformUsage } = await import('../lib/services/org/orgRepository.js');
const { createInvitation } = await import('../lib/services/org/invitationRepository.js');

// bp, wf, gov, opp, prof — the fixed query order inside perMemberScores.
const signalMocks = () => query
  .mockResolvedValueOnce([[{ user_id: 'a', started: 3, completed: 3 }]])
  .mockResolvedValueOnce([[{ user_id: 'a', prepared: 2 }]])
  .mockResolvedValueOnce([[{ user_id: 'a', avg: 100 }]])
  .mockResolvedValueOnce([[{ user_id: 'a', total: 5, engaged: 5 }]])
  .mockResolvedValueOnce([[{ user_id: 'a', technical_skill: 'developer' }]]);

describe('org aggregation (2.3–2.5)', () => {
  beforeEach(() => { query.mockReset(); listMembers.mockReset(); });

  it('perMemberScores scores each member with the shared formula', async () => {
    listMembers.mockResolvedValue([
      { user_id: 'a', email: 'a@x', name: 'A', role: 'manager', department: 'marketing' },
      { user_id: 'b', email: 'b@x', name: 'B', role: 'member', department: 'marketing' },
    ]);
    signalMocks();
    const rows = await perMemberScores('org1', 'marketing');
    expect(rows.find((r) => r.user_id === 'a').score).toBe(90); // fully engaged (90 ceiling until active workflows confirmed)
    expect(rows.find((r) => r.user_id === 'b').score).toBe(0);   // no activity
  });

  it('departmentComparison groups + averages by department', async () => {
    listMembers.mockResolvedValue([
      { user_id: 'a', email: 'a@x', name: 'A', role: 'manager', department: 'marketing' },
      { user_id: 'b', email: 'b@x', name: 'B', role: 'member', department: 'finance' },
    ]);
    signalMocks();
    const depts = await departmentComparison('org1');
    const mkt = depts.find((d) => d.key === 'marketing');
    const fin = depts.find((d) => d.key === 'finance');
    expect(mkt.members).toBe(1);
    expect(mkt.avg_score).toBe(90); // 90 ceiling until active workflows confirmed
    expect(fin.avg_score).toBe(0);
    expect(depts[0].key).toBe('marketing'); // sorted by score desc
  });

  it('orgOpportunityMap dedupes areas across members with people counts', async () => {
    listMembers.mockResolvedValue([{ user_id: 'a' }, { user_id: 'b' }]);
    query.mockResolvedValueOnce([[
      { department: 'marketing', area_key: 'mkt_lead_capture', label: 'Lead capture', instances: 3, addressed: 1, in_progress: 1, est_hours: 36 },
    ]]);
    const m = await orgOpportunityMap('org1');
    expect(m.total_instances).toBe(3);
    expect(m.by_department[0].label).toBe('Marketing');
    expect(m.by_department[0].areas[0].people).toBe(3); // 3 members share one area → one deduped row
    expect(m.by_department[0].distinct_areas).toBe(1);
  });

  it('platformUsage tallies built workflow targets', async () => {
    listMembers.mockResolvedValue([{ user_id: 'a' }]);
    query.mockResolvedValueOnce([[{ platform: 'n8n', n: 5 }, { platform: 'make', n: 2 }]]);
    const p = await platformUsage('org1');
    expect(p.total).toBe(7);
    expect(p.platforms[0]).toEqual({ platform: 'n8n', count: 5 });
  });

  it('returns empty rollups for an org with no members (no crash)', async () => {
    listMembers.mockResolvedValue([]);
    expect(await perMemberScores('org1')).toEqual([]);
    expect((await orgOpportunityMap('org1')).total_instances).toBe(0);
  });
});

describe('invitations (2.2) guards', () => {
  beforeEach(() => query.mockReset());
  it('rejects an invalid role', async () => {
    await expect(createInvitation({ orgId: 'o1', email: 'x@y.com', role: 'superuser' })).rejects.toThrow(/Invalid org role/);
  });
  it('requires an email', async () => {
    await expect(createInvitation({ orgId: 'o1', email: '' })).rejects.toThrow(/email is required/);
  });
  it('creates a tokened invite', async () => {
    query.mockResolvedValueOnce([{}]);
    const inv = await createInvitation({ orgId: 'o1', email: 'x@y.com', role: 'manager', department: 'finance' });
    expect(inv.token).toHaveLength(64);
    expect(query.mock.calls[0][0]).toMatch(/INSERT INTO org_invitations/i);
  });
});
