/**
 * Pulls everything a full governance scan needs for a Blueprint: its latest
 * generated workflow (Phases 1–2) plus the Blueprint metadata + version count +
 * owner (Phase 3 operational controls).
 */
import { pool } from '../../config/db.js';
import { normalizePolicy, deriveDefaultPolicy } from './policy.js';

const parse = (x) => (typeof x === 'string' ? safeParse(x) : x);
const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const asIntOrNull = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

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
    'SELECT workflow_json, target, blueprint_version FROM blueprint_workflows WHERE blueprint_id = ? ORDER BY seq DESC LIMIT 1',
    [blueprintId]
  );
  const wf = wfRows[0];
  const blueprint = parse(bp.blueprint_json);

  // Phase 6: the authored governance policy (or a derived, disabled default).
  const [[polRow]] = await pool.query('SELECT policy_json FROM blueprint_policies WHERE blueprint_id = ? LIMIT 1', [blueprintId]);
  const policy = polRow ? normalizePolicy(parse(polRow.policy_json)) : deriveDefaultPolicy(blueprint || {});

  return {
    workflow: wf ? parse(wf.workflow_json) : null,
    platform: wf?.target === 'make' ? 'make' : 'n8n',
    blueprint,
    versionCount: Number(bp.version_count) || 1,
    owner: bp.owner_email || bp.user_id || null,
    // Phase 6 — policy diff + version drift.
    policy,
    policyAuthored: !!polRow,
    currentVersion: asIntOrNull(bp.current_version),
    workflowVersion: wf ? asIntOrNull(wf.blueprint_version) : null,
  };
}

// ── Phase 6.1 policy persistence ──
export async function getPolicy(blueprintId) {
  const [[row]] = await pool.query('SELECT policy_json, enabled, updated_at FROM blueprint_policies WHERE blueprint_id = ? LIMIT 1', [blueprintId]);
  if (!row) return null;
  return { policy: normalizePolicy(parse(row.policy_json)), enabled: !!row.enabled, updated_at: row.updated_at };
}

export async function savePolicy({ blueprintId, policy, userId = null }) {
  const normalized = normalizePolicy(policy);
  await pool.query(
    `INSERT INTO blueprint_policies (blueprint_id, policy_json, enabled, authored_by)
       VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE policy_json = VALUES(policy_json), enabled = VALUES(enabled), authored_by = VALUES(authored_by)`,
    [blueprintId, JSON.stringify(normalized), normalized.enabled ? 1 : 0, userId]
  );
  return normalized;
}

/**
 * Persist one scan result as an immutable snapshot, so history + before/after
 * comparison work without re-running (and re-running a changed Blueprint would
 * otherwise silently produce different numbers). Best-effort: a persistence
 * failure never breaks the scan response — the scan is still returned to the
 * caller; we just log and move on.
 * @returns {number|null} the new row id, or null if it couldn't be saved.
 */
export async function saveScan({ blueprintId, userId = null, ctx, result }) {
  try {
    const o = result.report?.overall || {};
    const s = result.summary || {};
    const [res] = await pool.query(
      `INSERT INTO governance_scans
         (blueprint_id, user_id, platform, workflow_name, node_count, version_count, had_workflow,
          readiness_pct, readiness_band, security_risk_level, findings_total, worst_severity, manual_review_count,
          summary_json, findings_json, report_json, framework_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        blueprintId, userId, result.platform || ctx?.platform || 'n8n', result.workflow_name || null,
        result.node_count || 0, ctx?.versionCount || 0, ctx?.workflow ? 1 : 0,
        o.governance_readiness_pct ?? 0, o.readiness_band || null, o.security_risk_level || null,
        s.total ?? 0, s.worst_severity || null, s.manual_review_count ?? 0,
        JSON.stringify(s), JSON.stringify(result.findings || []),
        JSON.stringify(result.report || null), JSON.stringify(result.framework_mapping || null),
      ]
    );
    return res?.insertId ?? null;
  } catch (err) {
    console.error('[scanner] failed to persist scan:', err.message);
    return null;
  }
}

const toScanRow = (r) => ({
  id: Number(r.id),
  blueprint_id: r.blueprint_id,
  platform: r.platform,
  workflow_name: r.workflow_name,
  node_count: r.node_count,
  version_count: r.version_count,
  had_workflow: !!r.had_workflow,
  readiness_pct: r.readiness_pct,
  readiness_band: r.readiness_band,
  security_risk_level: r.security_risk_level,
  findings_total: r.findings_total,
  worst_severity: r.worst_severity,
  manual_review_count: r.manual_review_count,
  created_at: r.created_at,
});

/** Compact scan history (metrics only — no heavy JSON) for a Blueprint, newest first. */
export async function getScanHistory(blueprintId, limit = 20) {
  const [rows] = await pool.query(
    `SELECT id, blueprint_id, platform, workflow_name, node_count, version_count, had_workflow,
            readiness_pct, readiness_band, security_risk_level, findings_total, worst_severity,
            manual_review_count, created_at
       FROM governance_scans WHERE blueprint_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [blueprintId, Number(limit) || 20]
  );
  return rows.map(toScanRow);
}

/** Full latest persisted scan (with the JSON snapshot) for a Blueprint, or null. */
export async function getLatestScan(blueprintId) {
  const [[row]] = await pool.query(
    `SELECT * FROM governance_scans WHERE blueprint_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    [blueprintId]
  );
  if (!row) return null;
  return {
    ...toScanRow(row),
    summary: parse(row.summary_json),
    findings: parse(row.findings_json),
    report: parse(row.report_json),
    framework_mapping: parse(row.framework_json),
  };
}

// ── Phase 7.3 — the two most recent full snapshots, for before/after diff ──
export async function getLastTwoScans(blueprintId) {
  const [rows] = await pool.query(
    `SELECT readiness_pct, security_risk_level, findings_json, created_at
       FROM governance_scans WHERE blueprint_id = ? ORDER BY created_at DESC, id DESC LIMIT 2`,
    [blueprintId]
  );
  return rows.map((r) => ({
    readiness_pct: r.readiness_pct,
    security_risk_level: r.security_risk_level,
    findings: parse(r.findings_json) || [],
    created_at: r.created_at,
  }));
}

// ── Phase 7.2 — per-finding resolution tracking ──
const VALID_STATUS = new Set(['open', 'in_progress', 'resolved', 'accepted_risk']);

export async function getResolutions(blueprintId) {
  const [rows] = await pool.query(
    'SELECT finding_key, finding_type, node, status, note, updated_at FROM finding_resolutions WHERE blueprint_id = ?',
    [blueprintId]
  );
  const map = {};
  for (const r of rows) map[r.finding_key] = { finding_type: r.finding_type, node: r.node, status: r.status, note: r.note, updated_at: r.updated_at };
  return map;
}

export async function setResolution({ blueprintId, findingType, node = null, status, note = null, userId = null }) {
  if (!VALID_STATUS.has(status)) throw new Error(`Invalid status "${status}"`);
  const findingKey = `${findingType}::${node || ''}`;
  // 'open' is the default state → clearing it just removes the row (keeps the table lean).
  if (status === 'open') {
    await pool.query('DELETE FROM finding_resolutions WHERE blueprint_id = ? AND finding_key = ?', [blueprintId, findingKey]);
    return { findingKey, status };
  }
  await pool.query(
    `INSERT INTO finding_resolutions (blueprint_id, finding_key, finding_type, node, status, note, updated_by)
       VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), updated_by = VALUES(updated_by)`,
    [blueprintId, findingKey, findingType, node, status, note, userId]
  );
  return { findingKey, status };
}

export default { getScanContextForBlueprint, saveScan, getScanHistory, getLatestScan, getPolicy, savePolicy, getLastTwoScans, getResolutions, setResolution };
