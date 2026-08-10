/**
 * Task-discovery session persistence (Work Intelligence, Phase 2).
 */
import { randomUUID } from 'crypto';
import { pool } from '../../../config/db.js';

const parse = (x) => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } };

function shape(row) {
  if (!row) return null;
  return {
    id: row.id, user_id: row.user_id, connection_id: row.connection_id, platform: row.platform,
    external_task_id: row.external_task_id, task_name: row.task_name, status: row.status,
    context: parse(row.context_json), questions: parse(row.questions_json) || [], answers: parse(row.answers_json) || {},
    blueprint_id: row.blueprint_id, session_id: row.session_id, created_at: row.created_at, updated_at: row.updated_at,
  };
}

export async function createSession({ userId, connectionId = null, platform = null, externalTaskId = null, taskName = null, context = null, questions = [] }) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO task_discovery_sessions (id, user_id, connection_id, platform, external_task_id, task_name, status, context_json, questions_json, answers_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, userId, connectionId, platform, externalTaskId, taskName ? String(taskName).slice(0, 512) : null, 'clarifying',
      JSON.stringify(context || null), JSON.stringify(questions || []), JSON.stringify({})]
  );
  return getSession(id);
}

export async function getSession(id) {
  const [[row]] = await pool.query('SELECT * FROM task_discovery_sessions WHERE id = ? LIMIT 1', [id]);
  return shape(row);
}

/** Owner-scoped fetch — a session belongs to the user who started it. */
export async function getOwnedSession(id, userId) {
  const s = await getSession(id);
  return s && s.user_id === userId ? s : null;
}

export async function saveAnswers(id, answers) {
  await pool.query('UPDATE task_discovery_sessions SET answers_json = ? WHERE id = ?', [JSON.stringify(answers || {}), id]);
  return getSession(id);
}

export async function attachBlueprint(id, { blueprintId, sessionId }) {
  await pool.query("UPDATE task_discovery_sessions SET blueprint_id = ?, session_id = ?, status = 'blueprint_created' WHERE id = ?", [blueprintId, sessionId, id]);
  return getSession(id);
}

export async function listSessions(userId, { limit = 30 } = {}) {
  const [rows] = await pool.query('SELECT * FROM task_discovery_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?', [userId, Number(limit) || 30]);
  return rows.map(shape);
}

export default { createSession, getSession, getOwnedSession, saveAnswers, attachBlueprint, listSessions };
