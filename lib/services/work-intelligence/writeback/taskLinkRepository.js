/**
 * Blueprint ↔ task link persistence (Work Intelligence, Phase 4.3).
 */
import { pool } from '../../../config/db.js';

export async function createOrUpdateLink({ blueprintId, userId, connectionId = null, platform = null, externalTaskId = null, taskUrl = null }) {
  await pool.query(
    `INSERT INTO blueprint_task_links (blueprint_id, user_id, connection_id, platform, external_task_id, task_url)
       VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE connection_id=VALUES(connection_id), platform=VALUES(platform),
       external_task_id=VALUES(external_task_id), task_url=COALESCE(VALUES(task_url), task_url)`,
    [blueprintId, userId, connectionId, platform, externalTaskId, taskUrl]
  );
  return getLink(blueprintId);
}

export async function getLink(blueprintId) {
  const [[row]] = await pool.query('SELECT * FROM blueprint_task_links WHERE blueprint_id = ? LIMIT 1', [blueprintId]);
  return row || null;
}

export async function recordSync({ blueprintId, stage, syncRef = null, taskUrl = null }) {
  await pool.query(
    'UPDATE blueprint_task_links SET last_stage = ?, external_sync_ref = COALESCE(?, external_sync_ref), task_url = COALESCE(?, task_url), last_synced_at = CURRENT_TIMESTAMP WHERE blueprint_id = ?',
    [stage, syncRef, taskUrl, blueprintId]
  );
}

export default { createOrUpdateLink, getLink, recordSync };
