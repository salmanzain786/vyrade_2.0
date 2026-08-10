/**
 * Sync orchestrator (Work Intelligence, Phase 1 — the assembly step).
 *
 * This is the pipeline that ties the Phase-1 pieces together into something a
 * user can actually trigger: for each in-scope list, fetch tasks from the
 * connector, ENFORCE scope (isProjectInScope) and employee OPT-OUTS, apply the
 * field-level scope, then sanitize + store via ingestTasks. Nothing here is new
 * business logic — it's the wiring the individual, already-tested pieces needed.
 */
import { getConnector } from './connectors/registry.js';
import { accessTokenOf } from './connectionRepository.js';
import { isProjectInScope } from './scope.js';
import { getOptoutSet } from './optouts.js';
import { hashRef } from './sanitizer.js';
import { ingestTasks, purgeExpiredTasks } from './ingest.js';

/**
 * @param {{connection, fetcher?}} args  `fetcher` overrides the live connector
 *   call (used by tests); defaults to the real connector.fetchTasks.
 */
export async function syncConnection({ connection, fetcher = null } = {}) {
  const scope = connection.scope;
  if (!scope.read_enabled) return { ok: false, reason: 'read_disabled', tasks_ingested: 0 };

  const connector = getConnector(connection.platform);
  if (!connector) return { ok: false, reason: 'unknown_platform', tasks_ingested: 0 };

  // In-scope lists only (selected, not excluded). Reads NOTHING if none chosen.
  const lists = scope.projects.filter((p) => isProjectInScope(scope, p));
  if (!lists.length) return { ok: true, lists_synced: 0, tasks_fetched: 0, tasks_ingested: 0, tasks_excluded_optout: 0, note: 'No projects in scope — select projects to sync.' };

  const token = accessTokenOf(connection);
  const fetch = fetcher || ((listId, since) => connector.fetchTasks(token, { listId, since }));
  if (!fetcher && !token) throw new Error('Connection has no usable access token');

  const optouts = await getOptoutSet(connection.id);
  const since = scope.historical_range_days > 0 ? Date.now() - scope.historical_range_days * 86400_000 : null;

  let fetched = 0, excludedOptout = 0;
  const toIngest = [];
  for (const listId of lists) {
    const tasks = await fetch(listId, since); // normalized taskModel objects
    fetched += tasks.length;
    // Opt-in comment enrichment (2.2): only for live syncs with comments in
    // scope — the list endpoint omits comment bodies. Best-effort per task.
    if (!fetcher && scope.fields.comments && token && connector.fetchTaskComments) {
      for (const t of tasks) { try { t.comments = await connector.fetchTaskComments(token, t.external_id); } catch { /* skip */ } }
    }
    for (const t of tasks) {
      // Opt-out enforcement: exclude a task if ANY assignee has opted out.
      // Match on BOTH the platform id and the email, since an opt-out may be
      // registered by either (the setup UI takes an email).
      const refs = (t.assignees || []).flatMap((a) => [a.ref, a.email]).filter(Boolean).map((x) => hashRef(x));
      if (refs.some((r) => optouts.has(r))) { excludedOptout += 1; continue; }
      // Field-level scope: drop disabled fields BEFORE they're stored.
      if (!scope.fields.description) t.description = '';
      if (!scope.fields.checklist) t.checklist = [];
      if (!scope.fields.custom_fields) t.custom_fields = {};
      toIngest.push(t);
    }
  }

  const { ingested, redaction_types } = await ingestTasks({ connection, tasks: toIngest });
  const purged = await purgeExpiredTasks().catch(() => 0); // enforce retention each sync

  return { ok: true, lists_synced: lists.length, tasks_fetched: fetched, tasks_excluded_optout: excludedOptout, tasks_ingested: ingested, purged, redaction_types };
}

export default { syncConnection };
