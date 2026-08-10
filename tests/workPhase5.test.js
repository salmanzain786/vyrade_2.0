import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTaskContext } from '../lib/services/work-intelligence/discovery/context.js';

const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));
const { workFunnel } = await import('../lib/services/work-intelligence/funnel.js');
const { taskCostSignals } = await import('../lib/services/work-intelligence/costSignals.js');
const { getTaskOrigin } = await import('../lib/services/work-intelligence/writeback/taskLinkRepository.js');

describe('work funnel (5.4)', () => {
  beforeEach(() => query.mockReset());
  it('aggregates the task→outcome funnel with step conversion', async () => {
    query
      .mockResolvedValueOnce([[{ n: 100 }]])                                                     // tasks
      .mockResolvedValueOnce([[{ status: 'suggested', n: 5 }, { status: 'accepted', n: 2 }, { status: 'blueprint_created', n: 1 }]]) // opps
      .mockResolvedValueOnce([[{ n: 3 }]])   // links (blueprints started)
      .mockResolvedValueOnce([[{ n: 2 }]])   // complete
      .mockResolvedValueOnce([[{ n: 2 }]])   // prepared
      .mockResolvedValueOnce([[{ n: 1 }]])   // deployed
      .mockResolvedValueOnce([[{ n: 1 }]])   // measured
      .mockResolvedValueOnce([[{ n: 1 }]]);  // connections
    const f = await workFunnel();
    const by = Object.fromEntries(f.stages.map((s) => [s.key, s.count]));
    expect(by.tasks_analysed).toBe(100);
    expect(by.opportunities_identified).toBe(8);        // 5+2+1
    expect(by.opportunities_accepted).toBe(3);          // accepted + blueprint_created (+reviewing=0)
    expect(by.blueprints_started).toBe(3);
    expect(by.deployed).toBe(1);
    expect(by.measured).toBe(1);
    // conversion of "opportunities_identified" vs "tasks_analysed" = 8/100 = 8%
    expect(f.stages.find((s) => s.key === 'opportunities_identified').conversion_pct).toBe(8);
    expect(f.stages[0].conversion_pct).toBeNull(); // first stage has no previous
  });
});

describe('task-derived cost inputs (5.1)', () => {
  beforeEach(() => query.mockReset());
  it('derives frequency, assignees, steps, review steps and cycle time (labelled estimate)', async () => {
    query
      .mockResolvedValueOnce([[{ blueprint_id: 'bp1', connection_id: 'c1', external_task_id: 'T1' }]]) // getLink
      .mockResolvedValueOnce([[{
        recurrence: 1, assignee_count: 2,
        checklist: JSON.stringify([{ name: 'Steps', items: [{ name: 'Export data' }, { name: 'Send for approval' }] }]),
        related_ids: JSON.stringify(['r1']), due_date: '2026-02-10T00:00:00Z', task_created_at: '2026-02-01T00:00:00Z',
      }]]);
    const c = await taskCostSignals('bp1');
    expect(c.is_estimate).toBe(true);
    expect(c.recurring).toBe(true);
    expect(c.frequency_label).toMatch(/recurring/i);
    expect(c.assignees).toBe(2);
    expect(c.process_steps).toBe(2);
    expect(c.manual_review_steps).toBe(1);          // "Send for approval"
    expect(c.estimated_manual_minutes).toBe(20);    // 2 steps × 10m
    expect(c.average_cycle_days).toBe(9);
    expect(c.related_task_count).toBe(1);
  });
  it('returns null when the Blueprint is not task-linked', async () => {
    query.mockResolvedValueOnce([[]]); // getLink → no link
    expect(await taskCostSignals('bp1')).toBeNull();
  });
});

describe('Automation Assurance linkage — task-aware (5.3)', () => {
  beforeEach(() => query.mockReset());
  it('resolves the originating task (name + link) for a task-sourced Blueprint', async () => {
    query
      .mockResolvedValueOnce([[{ blueprint_id: 'bp1', connection_id: 'c1', external_task_id: 'T1', task_url: 'https://app.clickup.com/t/T1', platform: 'clickup' }]]) // getLink
      .mockResolvedValueOnce([[{ name: 'Monthly SEO reporting' }]]); // ingested_tasks name
    const o = await getTaskOrigin('bp1');
    expect(o).toMatchObject({ platform: 'clickup', external_task_id: 'T1', task_url: 'https://app.clickup.com/t/T1', task_name: 'Monthly SEO reporting' });
  });
  it('falls back to the discovery session task name when the task has aged out', async () => {
    query
      .mockResolvedValueOnce([[{ blueprint_id: 'bp1', connection_id: 'c1', external_task_id: 'T1', platform: 'clickup' }]]) // getLink
      .mockResolvedValueOnce([[]])                                    // ingested_tasks gone (retention)
      .mockResolvedValueOnce([[{ task_name: 'Client onboarding' }]]); // discovery fallback
    expect((await getTaskOrigin('bp1')).task_name).toBe('Client onboarding');
  });
  it('returns null for a Blueprint NOT born from a task (generic Blueprints stay generic)', async () => {
    query.mockResolvedValueOnce([[]]); // no link
    expect(await getTaskOrigin('bp1')).toBeNull();
  });
});

describe('retrieval enrichment — systems detected from task text (5.2)', () => {
  it('surfaces the systems a task mentions into the context', () => {
    const ctx = buildTaskContext({ external_id: '1', name: 'Sync leads', description: 'push from Salesforce to Google Sheets and notify Slack', checklist: '[]', tags: '[]' });
    expect(ctx.systems).toEqual(expect.arrayContaining(['salesforce', 'sheets', 'slack']));
  });
  it('is empty when no known system is mentioned', () => {
    expect(buildTaskContext({ external_id: '1', name: 'Do a thing', description: '', checklist: '[]', tags: '[]' }).systems).toEqual([]);
  });
});
