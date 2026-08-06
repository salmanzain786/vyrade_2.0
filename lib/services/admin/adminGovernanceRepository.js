/**
 * Admin — Governance rollup (Phase 8.2 / 8.3).
 *
 * Aggregates the LATEST persisted governance scan per Blueprint (from
 * governance_scans) into the org-level "Risk & Governance" module the AI
 * Adoption Intelligence dashboard specs — populated with REAL data, not
 * placeholders.
 *
 * Honest scope: there is no org/department model yet, so this is ORG-WIDE, not
 * department-level (department rollup is blocked on that model — documented, not
 * faked). The rows we can derive from scan findings are real; the ones that need
 * a platform-category taxonomy (true "duplicate platform" detection) are marked
 * unavailable rather than guessed.
 */
import { pool } from '../../config/db.js';

const parse = (x) => { try { return typeof x === 'string' ? JSON.parse(x) : (x || []); } catch { return []; } };
const HAS = (findings, types) => findings.some((f) => types.includes(f.type));

// Finding-type → risk-row mapping.
const SENSITIVE = ['pii_detected', 'special_category_data', 'sensitive_logging'];
const APPROVALS = ['approval_unspecified', 'policy_approval_missing'];
const DRIFT = ['workflow_version_drift'];
const PROCESSORS = ['third_party_processor', 'policy_external_model_used', 'policy_data_egress'];
const NO_OWNER = ['no_owner_assigned'];

export async function governanceRollup() {
  // Latest scan per Blueprint + its owner and name.
  const [rows] = await pool.query(
    `SELECT gs.blueprint_id, gs.readiness_pct, gs.security_risk_level, gs.findings_total,
            gs.findings_json, gs.created_at,
            b.user_id, u.email AS owner_email,
            JSON_UNQUOTE(JSON_EXTRACT(v.blueprint_json, '$.name')) AS name
       FROM governance_scans gs
       JOIN (SELECT blueprint_id, MAX(id) AS mid FROM governance_scans GROUP BY blueprint_id) L
         ON L.mid = gs.id
       LEFT JOIN automation_blueprints b ON b.id = gs.blueprint_id
       LEFT JOIN users u ON u.id = b.user_id
       LEFT JOIN automation_blueprint_versions v ON v.blueprint_id = b.id AND v.version = b.current_version`
  );
  const [[{ total_blueprints }]] = await pool.query('SELECT COUNT(*) AS total_blueprints FROM automation_blueprints');

  const scans = rows.map((r) => ({
    blueprint_id: r.blueprint_id,
    name: r.name || '(untitled)',
    owner: r.owner_email || null,
    readiness_pct: r.readiness_pct,
    risk: r.security_risk_level,
    findings_total: r.findings_total,
    findings: parse(r.findings_json),
    scanned_at: r.created_at,
  }));

  const scanned = scans.length;
  const avg_readiness = scanned ? Math.round(scans.reduce((s, x) => s + (x.readiness_pct || 0), 0) / scanned) : null;
  const risk = { High: 0, Medium: 0, Low: 0 };
  for (const s of scans) if (risk[s.risk] != null) risk[s.risk] += 1;

  // Each risk row: which Blueprints trip it (real, from findings / owner).
  const row = (predicate) => {
    const hits = scans.filter(predicate);
    return { count: hits.length, blueprints: hits.map((s) => ({ id: s.blueprint_id, name: s.name, owner: s.owner })) };
  };

  const risk_items = {
    no_owner: row((s) => !s.owner || HAS(s.findings, NO_OWNER)),
    sensitive_data: row((s) => HAS(s.findings, SENSITIVE)),
    missing_approvals: row((s) => HAS(s.findings, APPROVALS)),
    outdated_outputs: row((s) => HAS(s.findings, DRIFT)),
    processors_to_review: row((s) => HAS(s.findings, PROCESSORS)),
  };

  // Worst-readiness Blueprints (the triage list).
  const worst = [...scans]
    .sort((a, b) => (a.readiness_pct ?? 0) - (b.readiness_pct ?? 0))
    .slice(0, 10)
    .map((s) => ({ id: s.blueprint_id, name: s.name, owner: s.owner, readiness_pct: s.readiness_pct, risk: s.risk, findings_total: s.findings_total }));

  return {
    total_blueprints: Number(total_blueprints),
    scanned,
    unscanned: Math.max(0, Number(total_blueprints) - scanned),
    avg_readiness,
    risk,
    risk_items,
    worst,
    // Honest gaps — needs models that don't exist yet, so NOT faked.
    unavailable: {
      department_rollup: 'Needs the org/department model (AI Adoption Intelligence). Shipping org-wide until it exists.',
      duplicate_platforms: 'True duplicate-platform detection needs a platform-category taxonomy (same job, different tool). Not inferable from scan data alone.',
    },
  };
}

export default { governanceRollup };
