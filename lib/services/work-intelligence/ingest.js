/**
 * Task ingest (Work Intelligence, Phase 1.2 + 1.5). Sanitizes each normalized
 * task per the connection's scope rules, stamps a retention expiry from the
 * governance window, and upserts. Retention is enforced by purgeExpiredTasks.
 */
import { pool } from '../../config/db.js';
import { sanitizeTaskForStorage } from './sanitizer.js';
import { retentionExpiry } from './governance.js';

const toDbDate = (iso) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' '); };
const cut = (s, n) => (s == null ? null : String(s).slice(0, n));

/**
 * @param {{connection, tasks:Array}} args  tasks = normalized taskModel objects
 * @returns {{ingested:number, redaction_types:string[]}}
 */
export async function ingestTasks({ connection, tasks = [] }) {
  const rules = { ...connection.scope.sensitive_rules, __include_custom_fields: connection.scope.fields.custom_fields };
  const expiry = toDbDate(retentionExpiry(connection.governance).toISOString());
  const seenTypes = new Set();
  let ingested = 0;

  for (const t of tasks) {
    const s = sanitizeTaskForStorage(t, rules);
    s.redaction_types.forEach((x) => seenTypes.add(x));
    await pool.query(
      `INSERT INTO ingested_tasks
         (connection_id, user_id, platform, external_id, name, description, status, status_type, project, list_name,
          space_id, parent_id, subtask_count, comment_count, attachment_count, assignee_count, recurrence,
          due_date, task_created_at, task_updated_at, tags, checklist, custom_fields, assignee_refs, redaction_types, retention_expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), status=VALUES(status),
         status_type=VALUES(status_type), project=VALUES(project), list_name=VALUES(list_name),
         subtask_count=VALUES(subtask_count), comment_count=VALUES(comment_count), attachment_count=VALUES(attachment_count),
         assignee_count=VALUES(assignee_count), recurrence=VALUES(recurrence), due_date=VALUES(due_date),
         task_updated_at=VALUES(task_updated_at), tags=VALUES(tags), checklist=VALUES(checklist),
         custom_fields=VALUES(custom_fields), assignee_refs=VALUES(assignee_refs), redaction_types=VALUES(redaction_types),
         retention_expires_at=VALUES(retention_expires_at)`,
      [
        connection.id, connection.user_id, connection.platform, cut(s.external_id, 190), cut(s.name, 512), s.description,
        cut(s.status, 64), cut(s.status_type, 32), cut(s.project, 190), cut(s.list, 190), cut(s.space_id, 64), cut(s.parent_id, 190),
        s.subtask_count, s.comment_count, s.attachment_count, s.assignee_count, s.recurrence ? 1 : 0,
        toDbDate(s.due_date), toDbDate(s.created_at), toDbDate(s.updated_at),
        JSON.stringify(s.tags || []), JSON.stringify(s.checklist || []), JSON.stringify(s.custom_fields || {}),
        JSON.stringify(s.assignee_refs || []), JSON.stringify(s.redaction_types || []), expiry,
      ]
    );
    ingested += 1;
  }
  return { ingested, redaction_types: [...seenTypes] };
}

/** Retention enforcement (Phase 1.4): drop task content past its window. */
export async function purgeExpiredTasks() {
  const [res] = await pool.query('DELETE FROM ingested_tasks WHERE retention_expires_at IS NOT NULL AND retention_expires_at < NOW()');
  return res?.affectedRows || 0;
}

export default { ingestTasks, purgeExpiredTasks };
