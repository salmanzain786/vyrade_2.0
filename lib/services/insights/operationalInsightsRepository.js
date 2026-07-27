/**
 * Operational Insights — repository.
 *
 * `recordEvent` appends one operational event (fire-and-forget — it must NEVER
 * break the request it observes). The aggregation queries turn that log into
 * the learning signals: top failing nodes, import outcomes, repair stats, doc
 * gaps, and token/cost usage over a time window.
 */
import { pool } from '../../config/db.js';

const DEBUG = process.env.NODE_ENV !== 'production';

/**
 * Append an operational event. Fire-and-forget; swallows all errors.
 * @param {object} e  { eventType, platform?, blueprintId?, userId?, nodeType?,
 *                      tool?, errorCategory?, severity?, tokens?, costUsd?,
 *                      metric?, metadata? }
 */
export function recordEvent(e = {}) {
  if (!e.eventType) return;
  const metadata = e.metadata == null ? null : safeJson(e.metadata);
  pool.query(
    `INSERT INTO operational_events
       (event_type, platform, blueprint_id, user_id, node_type, tool,
        error_category, severity, tokens, cost_usd, metric, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      e.eventType, e.platform ?? null, e.blueprintId ?? null, e.userId ?? null,
      e.nodeType ?? null, e.tool ?? null, e.errorCategory ?? null,
      e.severity || 'info', e.tokens ?? null, e.costUsd ?? null, e.metric ?? null, metadata,
    ]
  ).catch((err) => { if (DEBUG) console.warn('[insights] recordEvent failed:', err?.message); });
}

/** Record several events (e.g. per-node) without awaiting. */
export function recordEvents(events = []) {
  for (const e of events) recordEvent(e);
}

function safeJson(obj) {
  try {
    // Keep it small + primitive; drop nested objects that could carry payloads.
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (v == null) continue;
      if (typeof v === 'object') continue; // no nested blobs
      const s = typeof v === 'string' ? v.slice(0, 120) : v;
      out[k] = s;
    }
    return JSON.stringify(out);
  } catch { return null; }
}

// ── Aggregations ────────────────────────────────────────────────────────────

const WINDOW = 'created_at >= NOW() - INTERVAL ? DAY';

/** Node types that most often break n8n import. */
export async function topFailingNodes({ days = 30, limit = 20 } = {}) {
  const [rows] = await pool.query(
    `SELECT node_type, COUNT(*) AS failures, MAX(created_at) AS last_seen
       FROM operational_events
      WHERE event_type = 'import_failed' AND node_type IS NOT NULL AND ${WINDOW}
      GROUP BY node_type ORDER BY failures DESC LIMIT ?`,
    [days, Number(limit)]
  );
  return rows.map((r) => ({ node_type: r.node_type, failures: Number(r.failures), last_seen: r.last_seen }));
}

/** Import outcome rates: verified vs. failed vs. skipped. */
export async function importOutcomes({ days = 30 } = {}) {
  const [rows] = await pool.query(
    `SELECT event_type, COUNT(*) AS c FROM operational_events
      WHERE event_type IN ('workflow_generated','import_failed','import_skipped') AND ${WINDOW}
      GROUP BY event_type`,
    [days]
  );
  const by = Object.fromEntries(rows.map((r) => [r.event_type, Number(r.c)]));
  const generated = by.workflow_generated || 0;
  return {
    generated,
    import_failed: by.import_failed || 0,
    import_skipped: by.import_skipped || 0,
    failure_rate: generated ? round((by.import_failed || 0) / generated) : null,
  };
}

/** Repair frequency + average repair attempts. */
export async function repairStats({ days = 30 } = {}) {
  const [[r]] = await pool.query(
    `SELECT COUNT(*) AS repairs, AVG(metric) AS avg_attempts
       FROM operational_events WHERE event_type = 'repair_performed' AND ${WINDOW}`,
    [days]
  );
  return { repairs: Number(r.repairs || 0), avg_attempts: r.avg_attempts != null ? round(Number(r.avg_attempts)) : null };
}

/** Tools/systems most often missing retrieval docs ("incomplete API docs"). */
export async function docGaps({ days = 30, limit = 20 } = {}) {
  const [rows] = await pool.query(
    `SELECT tool, COUNT(*) AS gaps FROM operational_events
      WHERE event_type = 'doc_gap' AND tool IS NOT NULL AND ${WINDOW}
      GROUP BY tool ORDER BY gaps DESC LIMIT ?`,
    [days, Number(limit)]
  );
  return rows.map((r) => ({ tool: r.tool, gaps: Number(r.gaps) }));
}

/** Token + cost usage over the window. */
export async function usageStats({ days = 30 } = {}) {
  const [[r]] = await pool.query(
    `SELECT COUNT(*) AS generations, SUM(tokens) AS total_tokens, SUM(cost_usd) AS total_cost
       FROM operational_events WHERE event_type = 'workflow_generated' AND ${WINDOW}`,
    [days]
  );
  return {
    generations: Number(r.generations || 0),
    total_tokens: Number(r.total_tokens || 0),
    total_cost_usd: r.total_cost != null ? round(Number(r.total_cost)) : 0,
  };
}

/** High-level event counts. */
export async function eventCounts({ days = 30 } = {}) {
  const [rows] = await pool.query(
    `SELECT event_type, COUNT(*) AS c FROM operational_events WHERE ${WINDOW}
      GROUP BY event_type ORDER BY c DESC`,
    [days]
  );
  return rows.map((r) => ({ event_type: r.event_type, count: Number(r.c) }));
}

/** One call for a dashboard. */
export async function getInsightsSummary({ days = 30 } = {}) {
  const [outcomes, repairs, usage, failingNodes, gaps, counts] = await Promise.all([
    importOutcomes({ days }), repairStats({ days }), usageStats({ days }),
    topFailingNodes({ days, limit: 10 }), docGaps({ days, limit: 10 }), eventCounts({ days }),
  ]);
  return { window_days: days, import: outcomes, repairs, usage, top_failing_nodes: failingNodes, doc_gaps: gaps, event_counts: counts };
}

const round = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

export default {
  recordEvent, recordEvents, topFailingNodes, importOutcomes, repairStats,
  docGaps, usageStats, eventCounts, getInsightsSummary,
};
