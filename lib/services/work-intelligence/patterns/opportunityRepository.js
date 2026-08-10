/**
 * Work-opportunity persistence (Work Intelligence, Phase 3.2/3.3). Upsert on
 * re-analysis (refreshing counts) WITHOUT clobbering a human-set status — an
 * accepted/dismissed opportunity stays that way.
 */
import { randomUUID } from 'crypto';
import { pool } from '../../../config/db.js';
import { getMembership } from '../../org/membershipRepository.js';
import { canReviewOpportunities } from '../../org/access.js';

export const OPP_STATUS = ['suggested', 'reviewing', 'accepted', 'dismissed', 'blueprint_created'];

const parse = (x) => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return null; } };
const shape = (r) => ({
  id: r.id, title: r.title, signal: r.signal, pattern_key: r.pattern_key,
  task_count: r.task_count, project_count: r.project_count, people_count: r.people_count,
  department: r.department, est_hours_month: r.est_hours_month, evidence: parse(r.evidence) || {},
  status: r.status, blueprint_id: r.blueprint_id, discovery_id: r.discovery_id, updated_at: r.updated_at,
  user_id: r.user_id, org_id: r.org_id, creator_email: r.creator_email, creator_name: r.creator_name,
});

/** Upsert a batch from an analysis run. Status is preserved on existing rows. */
export async function upsertOpportunities({ userId, orgId = null, connectionId, opportunities = [] }) {
  let saved = 0;
  for (const o of opportunities) {
    await pool.query(
      `INSERT INTO work_opportunities
         (id, user_id, org_id, connection_id, title, \`signal\`, pattern_key, task_count, project_count, people_count, est_hours_month, evidence)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE title=VALUES(title), task_count=VALUES(task_count), project_count=VALUES(project_count),
         people_count=VALUES(people_count), est_hours_month=VALUES(est_hours_month), evidence=VALUES(evidence),
         updated_at=CURRENT_TIMESTAMP`,               // status intentionally NOT updated
      [randomUUID(), userId, orgId, connectionId, String(o.title).slice(0, 255), o.signal, o.pattern_key ? String(o.pattern_key).slice(0, 190) : null,
        o.task_count || 0, o.project_count || 0, o.people_count || 0, o.est_hours_month ?? null, JSON.stringify(o.evidence || {})]
    );
    saved += 1;
  }
  return saved;
}

export async function listOpportunities(userId, { status = null, limit = 100 } = {}) {
  const params = [userId];
  let where = 'user_id = ?';
  if (status) { where += ' AND status = ?'; params.push(status); }
  const [rows] = await pool.query(
    `SELECT * FROM work_opportunities WHERE ${where} ORDER BY FIELD(status,'suggested','reviewing','accepted','blueprint_created','dismissed'), est_hours_month DESC LIMIT ?`,
    [...params, Number(limit) || 100]
  );
  return rows.map(shape);
}

/** Org-scoped listing for a manager/admin (Phase 3.3) — joins the creator. */
export async function listOrgOpportunities(orgId, { limit = 200 } = {}) {
  const [rows] = await pool.query(
    `SELECT o.*, u.email AS creator_email, u.name AS creator_name
       FROM work_opportunities o LEFT JOIN users u ON u.id = o.user_id
      WHERE o.org_id = ? ORDER BY o.est_hours_month DESC LIMIT ?`,
    [orgId, Number(limit) || 200]
  );
  return rows.map(shape);
}

export async function getOpportunity(id) {
  const [[row]] = await pool.query('SELECT * FROM work_opportunities WHERE id = ? LIMIT 1', [id]);
  return row ? shape(row) : null;
}
export async function getOwnedOpportunity(id, userId) {
  const [[row]] = await pool.query('SELECT * FROM work_opportunities WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
  return row ? shape(row) : null;
}

/**
 * Can this user act on this opportunity? The CREATOR always can; additionally an
 * owner/admin/manager of the SAME org can review a team member's opportunity
 * (Phase 3.3 manager review). Reuses the org access-control model.
 */
export async function canActOnOpportunity(opp, userId) {
  if (!opp) return false;
  if (opp.user_id === userId) return true;
  if (!opp.org_id) return false;
  const m = await getMembership(userId).catch(() => null);
  return !!(m && m.org_id === opp.org_id && canReviewOpportunities(m.role));
}

/** Status change — the CALLER must have authorized via canActOnOpportunity first. */
export async function setStatus(id, status) {
  if (!OPP_STATUS.includes(status)) throw new Error(`Invalid opportunity status "${status}"`);
  await pool.query('UPDATE work_opportunities SET status = ? WHERE id = ?', [status, id]);
  return getOpportunity(id);
}

export async function attachBlueprint(id, { blueprintId = null, discoveryId = null }) {
  const status = blueprintId ? 'blueprint_created' : 'reviewing';
  await pool.query(
    'UPDATE work_opportunities SET blueprint_id = COALESCE(?, blueprint_id), discovery_id = COALESCE(?, discovery_id), status = ? WHERE id = ?',
    [blueprintId, discoveryId, status, id]
  );
  return getOpportunity(id);
}

export default { upsertOpportunities, listOpportunities, listOrgOpportunities, getOpportunity, getOwnedOpportunity, canActOnOpportunity, setStatus, attachBlueprint, OPP_STATUS };
