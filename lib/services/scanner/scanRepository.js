/**
 * Pulls everything a full governance scan needs for a Blueprint: its latest
 * generated workflow (Phases 1–2) plus the Blueprint metadata + version count +
 * owner (Phase 3 operational controls).
 */
import { pool } from '../../config/db.js';

const parse = (x) => (typeof x === 'string' ? safeParse(x) : x);
const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

export async function getScanContextForBlueprint(blueprintId) {
  const [[bp]] = await pool.query(
    `SELECT b.current_version, b.user_id, u.email AS owner_email, v.blueprint_json,
            (SELECT COUNT(*) FROM automation_blueprint_versions vv WHERE vv.blueprint_id = b.id) AS version_count
       FROM automation_blueprints b
       JOIN automation_blueprint_versions v ON v.blueprint_id = b.id AND v.version = b.current_version
       LEFT JOIN users u ON u.id = b.user_id
      WHERE b.id = ? LIMIT 1`,
    [blueprintId]
  );
  if (!bp) return null;

  const [wfRows] = await pool.query(
    'SELECT workflow_json, target FROM blueprint_workflows WHERE blueprint_id = ? ORDER BY seq DESC LIMIT 1',
    [blueprintId]
  );
  const wf = wfRows[0];

  return {
    workflow: wf ? parse(wf.workflow_json) : null,
    platform: wf?.target === 'make' ? 'make' : 'n8n',
    blueprint: parse(bp.blueprint_json),
    versionCount: Number(bp.version_count) || 1,
    owner: bp.owner_email || bp.user_id || null,
  };
}

export default { getScanContextForBlueprint };
