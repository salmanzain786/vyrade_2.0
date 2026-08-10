import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectPatterns, normalizeTaskName } from '../lib/services/work-intelligence/patterns/detect.js';
import { buildOpportunities, toOpportunity } from '../lib/services/work-intelligence/patterns/opportunities.js';

const task = (over = {}) => ({ external_id: `t${Math.random()}`, name: 'Task', description: '', status: 'open', project: 'P1', recurrence: 0, subtask_count: 0, assignee_count: 1, checklist: '[]', status_history: '[]', assignee_refs: '[]', ...over });

describe('name normalization (3.1)', () => {
  it('canonicalizes dates/numbers/months so periodic tasks group together', () => {
    expect(normalizeTaskName('Monthly SEO report — Jan 2026')).toBe(normalizeTaskName('Monthly SEO report - Feb 2026'));
    expect(normalizeTaskName('Invoice #4021 follow-up')).toBe(normalizeTaskName('Invoice #5533 follow-up'));
  });
});

describe('pattern detection (3.1)', () => {
  it('detects repeated names and flags copied-across-projects', () => {
    const tasks = [
      task({ name: 'Monthly report Jan', project: 'Client A' }),
      task({ name: 'Monthly report Feb', project: 'Client B' }),
      task({ name: 'Monthly report Mar', project: 'Client C' }),
    ];
    const f = detectPatterns(tasks);
    const copied = f.find((x) => x.signal === 'copied_across_projects');
    expect(copied).toBeTruthy();
    expect(copied.task_count).toBe(3);
    expect(copied.project_count).toBe(3);
  });

  it('detects recurring, consistent checklists, and multi-person handoffs', () => {
    const cl = JSON.stringify([{ name: 'Steps', items: [{ name: 'Export data' }, { name: 'Send report' }] }]);
    // Same recurring process name across three tasks (a weekly onboarding run).
    const tasks = [
      task({ name: 'Customer onboarding', project: 'A', checklist: cl, recurrence: 1, assignee_count: 2 }),
      task({ name: 'Customer onboarding', project: 'B', checklist: cl, recurrence: 1, assignee_count: 2 }),
      task({ name: 'Customer onboarding', project: 'C', checklist: cl, recurrence: 1, assignee_count: 2 }),
    ];
    const sigs = detectPatterns(tasks).map((x) => x.signal);
    expect(sigs).toContain('consistent_checklist');
    expect(sigs).toContain('recurring');
    expect(sigs).toContain('handoff');
  });

  it('detects approval bottlenecks and reopened/rework', () => {
    const stuck = [1, 2, 3].map((i) => task({ name: `Approve ${i}`, description: 'needs review and approval', status: 'in progress' }));
    const churned = [1, 2, 3].map((i) => task({ name: `Fix ${i}`, status_history: JSON.stringify([{ to: 'open' }, { to: 'review' }, { to: 'open' }]) }));
    const sigs = detectPatterns([...stuck, ...churned]).map((x) => x.signal);
    expect(sigs).toContain('approval_bottleneck');
    expect(sigs).toContain('reopened');
  });

  it('ignores one-off tasks (below the group threshold) — no noise', () => {
    expect(detectPatterns([task({ name: 'Unique thing' }), task({ name: 'Another one' })])).toEqual([]);
  });

  // The four signals added after the client's 11-signal audit.
  it('#3 detects repeated SUBTASKS (child tasks with a parent)', () => {
    const subs = [1, 2, 3].map((i) => task({ name: 'Collect documents', parent_id: `parent${i}` }));
    expect(detectPatterns(subs).map((x) => x.signal)).toContain('repeated_subtask');
  });

  it('#6 detects long-running / overdue tasks (uses a fixed clock)', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    const old = { task_created_at: '2026-01-01T00:00:00Z' }; // ~5 months old, still open
    const overdue = { due_date: '2026-05-01T00:00:00Z', task_created_at: '2026-05-20T00:00:00Z' };
    const tasks = [task({ name: 'Long A', ...old }), task({ name: 'Long B', ...old }), task({ name: 'Overdue C', ...overdue })];
    const f = detectPatterns(tasks, { now });
    const dur = f.find((x) => x.signal === 'long_duration');
    expect(dur).toBeTruthy();
    expect(dur.task_count).toBe(3);
    // a DONE old task is excluded
    expect(detectPatterns([task({ status: 'closed', ...old }), task({ status: 'closed', ...old }), task({ status: 'closed', ...old })], { now }).some((x) => x.signal === 'long_duration')).toBe(false);
  });

  it('#7 status_churn is distinct from #11 reopened (churn = volume, reopened = back-transition)', () => {
    const churn = [1, 2, 3].map(() => task({ name: 'a', status_history: JSON.stringify([{ to: 's1' }, { to: 's2' }, { to: 's3' }, { to: 's4' }]) })); // 4 forward
    const back = [1, 2, 3].map(() => task({ name: 'b', status_history: JSON.stringify([{ to: 'open' }, { to: 'review' }, { to: 'open' }]) })); // back-transition
    const churnSigs = detectPatterns(churn).map((x) => x.signal);
    expect(churnSigs).toContain('status_churn');
    expect(churnSigs).not.toContain('reopened');   // no back-transition
    expect(detectPatterns(back).map((x) => x.signal)).toContain('reopened');
  });

  it('#9 detects common-tool usage across tasks (text heuristic)', () => {
    const tasks = [1, 2, 3].map((i) => task({ name: `Update ${i}`, description: 'sync data into Salesforce' }));
    const f = detectPatterns(tasks);
    const tool = f.find((x) => x.signal === 'common_tool');
    expect(tool).toBeTruthy();
    expect(tool.pattern_key).toBe('tool:salesforce');
  });
});

describe('opportunity naming (3.2)', () => {
  it('names findings like the spec examples + estimates directional hours', () => {
    const f = { signal: 'copied_across_projects', pattern_key: 'monthly report', label: 'Monthly report', task_count: 14, project_count: 14, people_count: 3, task_ids: [], projects: [] };
    const o = toOpportunity(f);
    expect(o.title).toBe('Monthly report across 14 projects');
    expect(o.est_hours_month).toBeGreaterThan(0);
    const handoff = toOpportunity({ signal: 'handoff', label: 'Lead cleanup', task_count: 6, people_count: 6, project_count: 1, task_ids: [], projects: [] });
    expect(handoff.title).toBe('Lead cleanup repeated by 6 people');
  });
  it('sorts opportunities by estimated impact', () => {
    const os = buildOpportunities([
      { signal: 'repeated_name', label: 'small', task_count: 3, project_count: 1, people_count: 1, task_ids: [], projects: [] },
      { signal: 'recurring', label: 'big', task_count: 20, project_count: 1, people_count: 1, task_ids: [], projects: [] },
    ]);
    expect(os[0].title).toMatch(/big/);
  });
});

// Repo: upsert preserves a human-set status.
const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const { setStatus, upsertOpportunities, canActOnOpportunity } = await import('../lib/services/work-intelligence/patterns/opportunityRepository.js');

describe('opportunity repository (3.3)', () => {
  beforeEach(() => query.mockReset());
  it('upsert does NOT reset status (accepted stays accepted on re-analysis)', async () => {
    query.mockResolvedValue([{}]);
    await upsertOpportunities({ userId: 'u1', connectionId: 'c1', opportunities: [{ title: 'x', signal: 'recurring', pattern_key: 'k', task_count: 3, evidence: {} }] });
    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/i);
    expect(sql).not.toMatch(/status=VALUES\(status\)/i); // status preserved
  });
  it('rejects an invalid status', async () => {
    await expect(setStatus('o1', 'bogus')).rejects.toThrow(/Invalid/);
  });
});

describe('manager review authorization (3.3) — who can confirm/dismiss', () => {
  beforeEach(() => query.mockReset());
  const member = (role, orgId = 'org1') => query.mockResolvedValueOnce([[{ org_id: orgId, role, department: null, org_name: 'Acme', owner_user_id: 'x' }]]);

  it('the CREATOR can always act — even with no org (no DB hit)', async () => {
    expect(await canActOnOpportunity({ user_id: 'u1', org_id: null }, 'u1')).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
  it('a non-creator with no org on the opportunity cannot act', async () => {
    expect(await canActOnOpportunity({ user_id: 'u1', org_id: null }, 'u2')).toBe(false);
  });
  it('an owner/admin/manager of the SAME org CAN act on a team member’s opportunity', async () => {
    member('manager'); expect(await canActOnOpportunity({ user_id: 'u1', org_id: 'org1' }, 'mgr')).toBe(true);
    member('admin');   expect(await canActOnOpportunity({ user_id: 'u1', org_id: 'org1' }, 'adm')).toBe(true);
  });
  it('a plain MEMBER cannot act on someone else’s opportunity', async () => {
    member('member'); expect(await canActOnOpportunity({ user_id: 'u1', org_id: 'org1' }, 'mem')).toBe(false);
  });
  it('a manager of a DIFFERENT org cannot act', async () => {
    member('admin', 'org2'); expect(await canActOnOpportunity({ user_id: 'u1', org_id: 'org1' }, 'mgr')).toBe(false);
  });
});
