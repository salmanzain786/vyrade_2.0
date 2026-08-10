import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB pool + the retention purge; capture what ingestTasks writes.
const query = vi.fn();
vi.mock('../lib/config/db.js', () => ({ pool: { query: (...a) => query(...a) } }));

const { syncConnection } = await import('../lib/services/work-intelligence/sync.js');
const { normalizeScope } = await import('../lib/services/work-intelligence/scope.js');
const { normalizeGovernance } = await import('../lib/services/work-intelligence/governance.js');
const { normalizeTask } = await import('../lib/services/work-intelligence/taskModel.js');
const { hashRef } = await import('../lib/services/work-intelligence/sanitizer.js');

// Default DB behaviour: no opt-outs, inserts/deletes succeed. Tests can override
// the connection_optouts branch. Returns proper mysql2 [rows|packet, fields] shapes.
const dbMock = (optRows = []) => query.mockImplementation(async (sql) => {
  if (/FROM connection_optouts/i.test(sql)) return [optRows];
  return [{ affectedRows: 0 }]; // ingest INSERTs + retention DELETE
});

const makeConn = (over = {}) => ({
  id: 'c1', user_id: 'u1', platform: 'clickup',
  scope: normalizeScope({ read_enabled: true, projects: ['L1', 'L2'], excluded_projects: ['L2'], fields: { description: true, checklist: true }, ...over.scope }),
  governance: normalizeGovernance(over.governance || {}),
  _enc: { access: null },
});

const clickupTask = (id, over = {}) => normalizeTask('clickup', { id, name: `Task ${id}`, status: { status: 'open' }, assignees: [], ...over });

describe('end-to-end sync (the assembly the pipeline was missing)', () => {
  beforeEach(() => query.mockReset());

  it('fetches in-scope lists only, sanitizes, and ingests — skipping excluded lists', async () => {
    const conn = makeConn(); // L1 included, L2 excluded
    const fetchedLists = [];
    const fetcher = vi.fn(async (listId) => { fetchedLists.push(listId); return [clickupTask('t1'), clickupTask('t2')]; });
    dbMock(); // no opt-outs

    const r = await syncConnection({ connection: conn, fetcher });
    expect(fetchedLists).toEqual(['L1']);          // L2 excluded → never fetched
    expect(r.lists_synced).toBe(1);
    expect(r.tasks_fetched).toBe(2);
    expect(r.tasks_ingested).toBe(2);
    // two ingest INSERTs happened (one per task)
    expect(query.mock.calls.filter((c) => /INSERT INTO ingested_tasks/i.test(c[0]))).toHaveLength(2);
  });

  it('EXCLUDES tasks assigned to an opted-out employee (opt-out enforcement)', async () => {
    const conn = makeConn({ scope: { projects: ['L1'], excluded_projects: [] } });
    const optRef = hashRef('sam@acme.com');
    dbMock([{ employee_ref: optRef }]); // sam is opted out
    const fetcher = async () => [
      clickupTask('keep', { assignees: [{ id: 1, email: 'bob@acme.com' }] }),
      clickupTask('drop', { assignees: [{ id: 2, email: 'sam@acme.com' }] }), // opted out
    ];
    const r = await syncConnection({ connection: conn, fetcher });
    expect(r.tasks_fetched).toBe(2);
    expect(r.tasks_excluded_optout).toBe(1);
    expect(r.tasks_ingested).toBe(1);
    // only the kept task's external_id shows up in an INSERT
    const inserted = query.mock.calls.filter((c) => /INSERT INTO ingested_tasks/i.test(c[0]));
    expect(inserted).toHaveLength(1);
    expect(inserted[0][1]).toContain('keep');
    expect(inserted[0][1]).not.toContain('drop');
  });

  it('reads NOTHING when no project is in scope', async () => {
    const conn = makeConn({ scope: { projects: [] } });
    const fetcher = vi.fn();
    const r = await syncConnection({ connection: conn, fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(r.tasks_ingested).toBe(0);
    expect(r.note).toMatch(/select projects/i);
  });

  it('does nothing when read is disabled', async () => {
    const conn = makeConn({ scope: { read_enabled: false, projects: ['L1'] } });
    const r = await syncConnection({ connection: conn, fetcher: vi.fn() });
    expect(r.reason).toBe('read_disabled');
  });

  it('applies field-level scope — a disabled field is dropped before storage', async () => {
    const conn = makeConn({ scope: { projects: ['L1'], excluded_projects: [], fields: { description: false, checklist: false } } });
    dbMock();
    const fetcher = async () => [clickupTask('t1', { text_content: 'secret process detail', checklists: [{ name: 'x', items: [] }] })];
    await syncConnection({ connection: conn, fetcher });
    const insert = query.mock.calls.find((c) => /INSERT INTO ingested_tasks/i.test(c[0]));
    // description param is empty (field disabled), not the original text
    expect(insert[1].join(' ')).not.toMatch(/secret process detail/);
  });
});
