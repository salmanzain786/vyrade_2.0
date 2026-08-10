/**
 * Read access to ingested tasks (Work Intelligence, Phase 2). Owner-scoped —
 * a user only sees tasks ingested under their own connection.
 */
import { pool } from '../../config/db.js';

export async function listIngestedTasks(userId, { connectionId = null, limit = 60 } = {}) {
  const params = [userId];
  let where = 'user_id = ?';
  if (connectionId) { where += ' AND connection_id = ?'; params.push(connectionId); }
  const [rows] = await pool.query(
    `SELECT id, connection_id, platform, external_id, name, status, project, list_name,
            recurrence, subtask_count, assignee_count, comment_count, ingested_at
       FROM ingested_tasks WHERE ${where} ORDER BY ingested_at DESC LIMIT ?`,
    [...params, Number(limit) || 60]
  );
  return rows;
}

export async function getIngestedTaskById(id, userId) {
  const [[row]] = await pool.query('SELECT * FROM ingested_tasks WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
  return row || null;
}

export async function getIngestedTaskByExternal(userId, externalId) {
  const [[row]] = await pool.query('SELECT * FROM ingested_tasks WHERE user_id = ? AND external_id = ? LIMIT 1', [userId, externalId]);
  return row || null;
}

/** The columns the Phase-3 pattern detector needs, over the user's tasks. */
export async function listTasksForAnalysis(userId, { connectionId = null, project = null, limit = 5000 } = {}) {
  const params = [userId];
  let where = 'user_id = ?';
  if (connectionId) { where += ' AND connection_id = ?'; params.push(connectionId); }
  if (project) { where += ' AND (project = ? OR list_name = ?)'; params.push(project, project); }
  const [rows] = await pool.query(
    `SELECT external_id, name, description, status, project, list_name, space_id, recurrence,
            subtask_count, assignee_count, checklist, status_history, assignee_refs
       FROM ingested_tasks WHERE ${where} LIMIT ?`,
    [...params, Number(limit) || 5000]
  );
  return rows;
}

/** Distinct project/list names for the "Analyse a project" picker. */
export async function listProjects(userId, { connectionId = null } = {}) {
  const params = [userId];
  let where = 'user_id = ?';
  if (connectionId) { where += ' AND connection_id = ?'; params.push(connectionId); }
  const [rows] = await pool.query(
    `SELECT COALESCE(project, list_name) AS project, COUNT(*) n FROM ingested_tasks WHERE ${where} AND COALESCE(project, list_name) IS NOT NULL GROUP BY COALESCE(project, list_name) ORDER BY n DESC`,
    params
  );
  return rows.map((r) => ({ project: r.project, count: Number(r.n) }));
}

export default { listIngestedTasks, getIngestedTaskById, listTasksForAnalysis, listProjects };
