/**
 * Admin — Failures & import checks (milestone 3.4).
 *
 * Presentation over already-captured operational data:
 *   • import verdicts  ← blueprint_workflows.workflow_json.$.meta.import_check
 *   • failure counts   ← operational_events (generation_failed / import_failed /
 *                        repair_performed / import_skipped / workflow_generated)
 *   • recent failures  ← operational_events, joined to the blueprint + owner
 * Top failing nodes + repair stats reuse the existing insights aggregators.
 */
import { pool } from '../../config/db.js';
import { topFailingNodes, repairStats } from '../../services/insights/operationalInsightsRepository.js';

const clampInt = (v, lo, hi, dflt) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** import_check verdict counts across all stored workflows. */
export async function importVerdicts() {
  const [rows] = await pool.query(
    `SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(workflow_json, '$.meta.import_check')), 'unknown') AS verdict,
            COUNT(*) AS n
       FROM blueprint_workflows
      GROUP BY verdict`
  );
  const out = { verified: 0, skipped: 0, failed: 0, unknown: 0 };
  for (const r of rows) out[r.verdict] = (out[r.verdict] || 0) + Number(r.n);
  return out;
}

/** Event counts over a window (the summary tiles). */
export async function failureSummary({ days = 30 } = {}) {
  const [rows] = await pool.query(
    `SELECT event_type, COUNT(*) AS n
       FROM operational_events
      WHERE event_type IN ('generation_failed','import_failed','repair_performed','import_skipped','workflow_generated')
        AND created_at >= NOW() - INTERVAL ? DAY
      GROUP BY event_type`,
    [days]
  );
  const by = Object.fromEntries(rows.map((r) => [r.event_type, Number(r.n)]));
  const generated = by.workflow_generated || 0;
  const importFailed = by.import_failed || 0;
  return {
    generated,
    generation_failed: by.generation_failed || 0,
    import_failed: importFailed,
    import_skipped: by.import_skipped || 0,
    repairs: by.repair_performed || 0,
    import_failure_rate: generated ? Math.round((importFailed / generated) * 100) : null,
  };
}

/** Recent failure events, joined to the blueprint + owner for context. */
export async function recentFailures({ days = 30, page = 1, pageSize = 50, all = false } = {}) {
  const pg = clampInt(page, 1, 1e6, 1);
  const size = all ? 10000 : clampInt(pageSize, 1, 200, 50);
  const offset = all ? 0 : (pg - 1) * size;

  const from = `
    FROM operational_events oe
    LEFT JOIN automation_blueprints b ON b.id = oe.blueprint_id
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN automation_blueprint_versions v ON v.blueprint_id = b.id AND v.version = b.current_version
   WHERE oe.event_type IN ('generation_failed','import_failed')
     AND oe.created_at >= NOW() - INTERVAL ? DAY`;

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, [days]);
  const [rows] = await pool.query(
    `SELECT oe.id, oe.event_type, oe.platform, oe.node_type, oe.error_category, oe.severity,
            oe.created_at, oe.blueprint_id, u.email AS user_email,
            JSON_UNQUOTE(JSON_EXTRACT(v.blueprint_json, '$.name')) AS blueprint_name
       ${from}
      ORDER BY oe.created_at DESC
      LIMIT ${size} OFFSET ${offset}`,
    [days]
  );

  return {
    rows: rows.map((r) => ({
      id: Number(r.id),
      type: r.event_type,
      platform: r.platform,
      node_type: r.node_type,
      error_category: r.error_category,
      severity: r.severity,
      blueprint_id: r.blueprint_id,
      blueprint_name: r.blueprint_name || (r.blueprint_id ? '(untitled)' : '—'),
      user_email: r.user_email || '—',
      created_at: r.created_at,
    })),
    total: Number(total),
    page: pg,
    pageSize: size,
    pages: Math.max(1, Math.ceil(Number(total) / size)),
  };
}

/** One call for the whole page. */
export async function getFailuresView({ days = 30, page = 1 } = {}) {
  const [verdicts, summary, nodes, repairs, recent] = await Promise.all([
    importVerdicts(),
    failureSummary({ days }),
    topFailingNodes({ days, limit: 10 }),
    repairStats({ days }),
    recentFailures({ days, page }),
  ]);
  return { verdicts, summary, topFailingNodes: nodes, repairs, recent, days };
}

export default { importVerdicts, failureSummary, recentFailures, getFailuresView };
