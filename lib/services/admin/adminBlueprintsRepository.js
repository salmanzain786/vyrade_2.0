/**
 * Admin — Blueprints overview (milestone 3.3).
 *
 * Lists every Blueprint across all users with status, readiness score, version,
 * owner and last activity, joined to the CURRENT version for its name/readiness.
 * Server-side search + status filter + pagination so the view stays usable at
 * scale (3.7). Read-only.
 */
import { pool } from '../../config/db.js';

// The Blueprint lifecycle statuses (from checkReadiness / the blueprints table).
export const BLUEPRINT_STATUSES = ['collecting_requirements', 'requirements_complete', 'blocked'];

const clampInt = (v, lo, hi, dflt) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/**
 * @param {{search?, status?, page?, pageSize?}} opts
 * @returns {Promise<{rows, total, page, pageSize, pages}>}
 */
export async function listBlueprints({ search = '', status = '', page = 1, pageSize = 50, all = false } = {}) {
  const pg = clampInt(page, 1, 1e6, 1);
  const size = all ? 10000 : clampInt(pageSize, 1, 200, 50);
  const offset = all ? 0 : (pg - 1) * size;

  const from = `
    FROM automation_blueprints b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN automation_blueprint_versions v
           ON v.blueprint_id = b.id AND v.version = b.current_version`;

  const where = [];
  const params = [];
  if (status && BLUEPRINT_STATUSES.includes(status)) { where.push('b.status = ?'); params.push(status); }
  if (search) {
    where.push(`(u.email LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(v.blueprint_json, '$.name')) LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from} ${whereSql}`, params);

  const [rows] = await pool.query(
    `SELECT b.id, b.status, b.current_version AS version, b.updated_at, b.created_at,
            u.email AS user_email, u.name AS user_name,
            JSON_UNQUOTE(JSON_EXTRACT(v.blueprint_json, '$.name'))  AS name,
            JSON_EXTRACT(v.readiness_json, '$.score')               AS readiness_score,
            JSON_LENGTH(JSON_EXTRACT(v.readiness_json, '$.blocking_unknowns')) AS blocking_count
       ${from} ${whereSql}
      ORDER BY b.updated_at DESC
      LIMIT ${size} OFFSET ${offset}`,
    params
  );

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name || '(untitled)',
      status: r.status,
      version: r.version,
      readiness_score: r.readiness_score == null ? null : Number(r.readiness_score),
      blocking_count: r.blocking_count == null ? null : Number(r.blocking_count),
      user_email: r.user_email,
      user_name: r.user_name,
      updated_at: r.updated_at,
      created_at: r.created_at,
    })),
    total: Number(total),
    page: pg,
    pageSize: size,
    pages: Math.max(1, Math.ceil(Number(total) / size)),
  };
}

export default { listBlueprints, BLUEPRINT_STATUSES };
