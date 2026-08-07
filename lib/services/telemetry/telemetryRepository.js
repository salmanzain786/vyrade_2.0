/**
 * Execution telemetry (Phase 4). Ingestion tokens + append-only execution events
 * + aggregation into reliability metrics (4.2) and measured volume (4.3/4.4).
 *
 * PRIVACY: only coarse facts are stored — a validated status, a duration, a
 * COARSE error category (raw messages are categorised then discarded), and an
 * intervention flag. Never payloads or PII.
 */
import { randomBytes } from 'crypto';
import { pool } from '../../config/db.js';
import { errorCategoryFromN8n } from '../insights/operationalInsights.js';

const STATUSES = new Set(['success', 'error', 'waiting']);
const normStatus = (s) => { const v = String(s || '').toLowerCase(); return STATUSES.has(v) ? v : (/(fail|error|crash)/.test(v) ? 'error' : /(wait|pending)/.test(v) ? 'waiting' : 'success'); };
const toIntOrNull = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : Math.max(0, Math.trunc(+v)));
const toDateOrNull = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' '); };

// ── Ingestion tokens ──
export async function createToken({ userId, label = null }) {
  const token = randomBytes(32).toString('hex');
  await pool.query('INSERT INTO telemetry_tokens (token, user_id, label) VALUES (?,?,?)', [token, userId, label ? String(label).slice(0, 96) : null]);
  return { token, label };
}
export async function listTokens(userId) {
  const [rows] = await pool.query('SELECT token, label, revoked, last_used_at, created_at FROM telemetry_tokens WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  // Expose ONLY a masked hint — the full secret never leaves the server after creation.
  return rows.map((r) => ({ token_hint: `${r.token.slice(0, 8)}…${r.token.slice(-4)}`, label: r.label, revoked: !!r.revoked, last_used_at: r.last_used_at, created_at: r.created_at }));
}
/** Revoke by the full token or by its masked hint (prefix…suffix) — scoped to the user. */
export async function revokeToken({ userId, token }) {
  if (token && token.includes('…')) {
    const [prefix, suffix] = token.split('…');
    await pool.query('UPDATE telemetry_tokens SET revoked = 1 WHERE user_id = ? AND LEFT(token, ?) = ? AND RIGHT(token, ?) = ?', [userId, prefix.length, prefix, suffix.length, suffix]);
  } else {
    await pool.query('UPDATE telemetry_tokens SET revoked = 1 WHERE user_id = ? AND token = ?', [userId, token]);
  }
}
/** Resolve an ingestion token → its user (and stamp last_used). Null if invalid/revoked. */
export async function resolveToken(token) {
  if (!token) return null;
  const [[row]] = await pool.query('SELECT user_id FROM telemetry_tokens WHERE token = ? AND revoked = 0 LIMIT 1', [token]);
  if (!row) return null;
  pool.query('UPDATE telemetry_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = ?', [token]).catch(() => {});
  return { userId: row.user_id };
}

// ── Ingestion (4.1) ──
/**
 * Record one execution event. `raw_error` (if any) is categorised then dropped.
 * blueprint_id is validated to belong to the token's user; unknown ids are stored
 * as null (still counted in the user's totals).
 */
export async function recordExecutionEvent({ userId, blueprintId = null, platform = 'n8n', externalWorkflowId = null, status, durationMs = null, rawError = null, errorCategory = null, humanIntervention = false, occurredAt = null }) {
  let bp = null;
  if (blueprintId) {
    const [[owned]] = await pool.query('SELECT id FROM automation_blueprints WHERE id = ? AND user_id = ? LIMIT 1', [blueprintId, userId]);
    bp = owned ? blueprintId : null;
  }
  const st = normStatus(status);
  const cat = st === 'error' ? (errorCategory ? String(errorCategory).slice(0, 48) : (rawError ? errorCategoryFromN8n(rawError) : 'unknown')) : null;
  await pool.query(
    `INSERT INTO execution_events (blueprint_id, user_id, platform, external_workflow_id, status, duration_ms, error_category, human_intervention, occurred_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [bp, userId, String(platform).slice(0, 32) || 'n8n', externalWorkflowId ? String(externalWorkflowId).slice(0, 190) : null, st, toIntOrNull(durationMs), cat, humanIntervention ? 1 : 0, toDateOrNull(occurredAt) || toDateOrNull(new Date())]
  );
  return { status: st, error_category: cat };
}

// ── Aggregation (4.2 / 4.3 / 4.4) ──
function shape(agg, byError, windowDays) {
  const total = Number(agg.total) || 0;
  const success = Number(agg.success) || 0;
  const error = Number(agg.error) || 0;
  const waiting = Number(agg.waiting) || 0;
  const interventions = Number(agg.interventions) || 0;
  const monthlyRuns = windowDays > 0 ? Math.round((total * 30) / windowDays) : total;
  return {
    has_data: total > 0,
    window_days: windowDays,
    total, success, error, waiting,
    success_rate: total ? Math.round((success / total) * 100) : null,
    failure_rate: total ? Math.round((error / total) * 100) : null,
    avg_duration_ms: agg.avg_ms == null ? null : Math.round(Number(agg.avg_ms)),
    interventions,
    intervention_rate: total ? Math.round((interventions / total) * 100) : null,
    by_error: byError.map((e) => ({ category: e.error_category || 'unknown', count: Number(e.n) })),
    measured_monthly_runs: monthlyRuns, // 4.3 — real volume (drives platform cost)
  };
}

const AGG = `COUNT(*) total, SUM(status='success') success, SUM(status='error') error, SUM(status='waiting') waiting, AVG(duration_ms) avg_ms, SUM(human_intervention) interventions`;

/** Per-Blueprint reliability metrics over the last N days. */
export async function executionMetrics(blueprintId, { days = 30 } = {}) {
  const [[agg]] = await pool.query(`SELECT ${AGG} FROM execution_events WHERE blueprint_id = ? AND occurred_at >= (NOW() - INTERVAL ? DAY)`, [blueprintId, days]);
  const [byError] = await pool.query(`SELECT error_category, COUNT(*) n FROM execution_events WHERE blueprint_id = ? AND status='error' AND occurred_at >= (NOW() - INTERVAL ? DAY) GROUP BY error_category ORDER BY n DESC`, [blueprintId, days]);
  return shape(agg, byError, days);
}

/** All-blueprints reliability for a user (dashboard). */
export async function userExecutionSummary(userId, { days = 30 } = {}) {
  const [[agg]] = await pool.query(`SELECT ${AGG} FROM execution_events WHERE user_id = ? AND occurred_at >= (NOW() - INTERVAL ? DAY)`, [userId, days]);
  const [byError] = await pool.query(`SELECT error_category, COUNT(*) n FROM execution_events WHERE user_id = ? AND status='error' AND occurred_at >= (NOW() - INTERVAL ? DAY) GROUP BY error_category ORDER BY n DESC`, [userId, days]);
  return shape(agg, byError, days);
}

export default { createToken, listTokens, revokeToken, resolveToken, recordExecutionEvent, executionMetrics, userExecutionSummary };
