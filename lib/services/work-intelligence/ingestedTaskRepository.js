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

export default { listIngestedTasks, getIngestedTaskById };
