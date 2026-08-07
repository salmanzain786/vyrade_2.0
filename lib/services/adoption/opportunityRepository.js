/**
 * Opportunity map persistence (Phase 1.2). Seeded from the curated catalog; each
 * row carries a lifecycle status the user (or wired events) advance.
 */
import { pool } from '../../config/db.js';
import { opportunitiesForProfile } from './catalog.js';

export const OPP_STATUS = ['suggested', 'discovered', 'considered', 'in_progress', 'addressed', 'dismissed'];

/**
 * Seed the user's map from their profile. INSERT IGNORE — never clobbers the
 * status of an area the user already has (idempotent; safe to re-run when the
 * profile changes). Returns how many new areas were added.
 */
export async function seedOpportunitiesForProfile(userId, profile) {
  const areas = opportunitiesForProfile(profile || {});
  if (!areas.length) return 0;
  const values = areas.map(() => '(?,?,?,?,?,?)').join(',');
  const params = areas.flatMap((a) => [userId, a.key, a.label, a.department, a.est_hours_month ?? null, a.complexity ?? null]);
  const [res] = await pool.query(
    `INSERT IGNORE INTO opportunity_map (user_id, area_key, label, department, est_hours_month, complexity)
     VALUES ${values}`,
    params
  );
  return res?.affectedRows ?? 0;
}

export async function listOpportunities(userId) {
  const [rows] = await pool.query(
    `SELECT area_key, label, department, est_hours_month, complexity, status, blueprint_id, updated_at
       FROM opportunity_map WHERE user_id = ?
      ORDER BY FIELD(status,'in_progress','considered','discovered','suggested','addressed','dismissed'), est_hours_month DESC`,
    [userId]
  );
  return rows.map((r) => ({
    area_key: r.area_key, label: r.label, department: r.department,
    est_hours_month: r.est_hours_month, complexity: r.complexity,
    status: r.status, blueprint_id: r.blueprint_id, updated_at: r.updated_at,
  }));
}

export async function setOpportunityStatus({ userId, areaKey, status, blueprintId = undefined }) {
  if (!OPP_STATUS.includes(status)) throw new Error(`Invalid opportunity status "${status}"`);
  if (blueprintId !== undefined) {
    await pool.query('UPDATE opportunity_map SET status = ?, blueprint_id = ? WHERE user_id = ? AND area_key = ?',
      [status, blueprintId, userId, areaKey]);
  } else {
    await pool.query('UPDATE opportunity_map SET status = ? WHERE user_id = ? AND area_key = ?',
      [status, userId, areaKey]);
  }
  return { areaKey, status };
}

/** Status tallies for the dashboard's coverage math. */
export async function opportunityCounts(userId) {
  const [rows] = await pool.query(
    'SELECT status, COUNT(*) AS n, COALESCE(SUM(est_hours_month),0) AS hrs FROM opportunity_map WHERE user_id = ? GROUP BY status',
    [userId]
  );
  const by = {}; let total = 0; let addressedHours = 0;
  for (const r of rows) { by[r.status] = Number(r.n); total += Number(r.n); if (r.status === 'addressed') addressedHours = Number(r.hrs); }
  const addressed = by.addressed || 0;
  const engaged = (by.discovered || 0) + (by.considered || 0) + (by.in_progress || 0) + addressed;
  return { by_status: by, total, addressed, engaged, addressed_hours_month: addressedHours };
}

export default { seedOpportunitiesForProfile, listOpportunities, setOpportunityStatus, opportunityCounts, OPP_STATUS };
