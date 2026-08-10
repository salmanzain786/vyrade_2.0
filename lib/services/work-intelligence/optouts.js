/**
 * Employee opt-outs (Work Intelligence, Phase 1.4 enforcement). An employee can
 * opt out of having their tasks analysed; the sync pipeline excludes any task
 * assigned to an opted-out person. Opt-out is stored HASHED (same HMAC as task
 * assignee refs), so we match without ever storing a raw identity.
 */
import { pool } from '../../config/db.js';
import { hashRef } from './sanitizer.js';

/** Set of hashed employee refs that have opted out of this connection. */
export async function getOptoutSet(connectionId) {
  const [rows] = await pool.query('SELECT employee_ref FROM connection_optouts WHERE connection_id = ?', [connectionId]);
  return new Set(rows.map((r) => r.employee_ref));
}

/** Add an opt-out by a raw identifier (email/id) — hashed before storage. */
export async function addOptout({ connectionId, employee }) {
  const ref = hashRef(employee);
  if (!ref) throw new Error('employee identifier required');
  await pool.query('INSERT IGNORE INTO connection_optouts (connection_id, employee_ref) VALUES (?,?)', [connectionId, ref]);
  return { employee_ref: ref };
}

export async function removeOptout({ connectionId, employee, employeeRef = null }) {
  const ref = employeeRef || hashRef(employee);
  await pool.query('DELETE FROM connection_optouts WHERE connection_id = ? AND employee_ref = ?', [connectionId, ref]);
}

/** Hashed refs only — never a raw identity. */
export async function listOptouts(connectionId) {
  const [rows] = await pool.query('SELECT employee_ref, created_at FROM connection_optouts WHERE connection_id = ? ORDER BY created_at DESC', [connectionId]);
  return rows.map((r) => ({ employee_ref: r.employee_ref, hint: `${r.employee_ref.slice(0, 8)}…`, created_at: r.created_at }));
}

export default { getOptoutSet, addOptout, removeOptout, listOptouts };
