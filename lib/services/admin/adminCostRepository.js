/**
 * Admin — Cost & usage (milestone 3.5).
 *
 * Per-user token spend + a daily cost trend (from conversation_messages.cost_usd,
 * windowed by message time), plus rate-limit block counts from auth_attempts.
 * A "spike" flag marks users spending well above the window average. Read-only.
 */
import { pool } from '../../config/db.js';

const clampInt = (v, lo, hi, dflt) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const num = (v) => (v == null ? 0 : Number(v));

/** Window totals — also yields the mean per-user cost used for spike detection. */
export async function costSummary({ days = 30 } = {}) {
  const [[r]] = await pool.query(
    `SELECT SUM(m.cost_usd) AS cost, SUM(m.total_tokens) AS tokens, COUNT(DISTINCT c.user_id) AS users
       FROM conversation_messages m
       JOIN conversations c ON c.session_id = m.session_id
      WHERE m.created_at >= NOW() - INTERVAL ? DAY`,
    [days]
  );
  const users = num(r.users);
  const cost = num(r.cost);
  return { total_cost: cost, total_tokens: num(r.tokens), users, mean_cost: users ? cost / users : 0 };
}

/** Daily cost + tokens for the trend chart. */
export async function costTrend({ days = 30 } = {}) {
  const [rows] = await pool.query(
    `SELECT DATE(m.created_at) AS day, SUM(m.cost_usd) AS cost, SUM(m.total_tokens) AS tokens
       FROM conversation_messages m
      WHERE m.created_at >= NOW() - INTERVAL ? DAY
      GROUP BY day ORDER BY day`,
    [days]
  );
  return rows.map((r) => ({ day: r.day, cost: num(r.cost), tokens: num(r.tokens) }));
}

/** Per-user spend over the window, spike-flagged against the mean. */
export async function perUserSpend({ days = 30, page = 1, pageSize = 50, meanCost = 0, all = false } = {}) {
  const pg = clampInt(page, 1, 1e6, 1);
  const size = all ? 10000 : clampInt(pageSize, 1, 200, 50);
  const offset = all ? 0 : (pg - 1) * size;

  const from = `
    FROM conversation_messages m
    JOIN conversations c ON c.session_id = m.session_id
    JOIN users u ON u.id = c.user_id
   WHERE m.created_at >= NOW() - INTERVAL ? DAY`;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM (SELECT c.user_id ${from} GROUP BY c.user_id) t`, [days]
  );
  const [rows] = await pool.query(
    `SELECT c.user_id, u.email, u.name,
            COUNT(DISTINCT c.session_id) AS convos,
            SUM(m.cost_usd)   AS cost,
            SUM(m.total_tokens) AS tokens,
            MAX(m.created_at) AS last_activity
       ${from}
      GROUP BY c.user_id, u.email, u.name
      ORDER BY cost DESC
      LIMIT ${size} OFFSET ${offset}`,
    [days]
  );

  // Spike = clearly above average AND not trivially small.
  const spikeFloor = Math.max(0.5, meanCost * 2);
  return {
    rows: rows.map((r) => {
      const cost = num(r.cost);
      return {
        user_id: r.user_id, email: r.email, name: r.name,
        convos: num(r.convos), cost, tokens: num(r.tokens),
        last_activity: r.last_activity,
        spike: cost >= spikeFloor && cost > 0,
      };
    }),
    total: num(total), page: pg, pageSize: size, pages: Math.max(1, Math.ceil(num(total) / size)),
  };
}

/** Rate-limit blocks + failed-login context from auth_attempts. */
export async function authBlocks({ days = 30 } = {}) {
  const [[counts]] = await pool.query(
    `SELECT
       SUM(outcome = 'blocked') AS blocked,
       SUM(outcome = 'failure') AS failed
     FROM auth_attempts WHERE created_at >= NOW() - INTERVAL ? DAY`,
    [days]
  );
  const [top] = await pool.query(
    `SELECT COALESCE(email, ip, '(unknown)') AS who, COUNT(*) AS n, MAX(created_at) AS last
       FROM auth_attempts
      WHERE outcome = 'blocked' AND created_at >= NOW() - INTERVAL ? DAY
      GROUP BY who ORDER BY n DESC LIMIT 10`,
    [days]
  );
  return {
    blocked: num(counts.blocked),
    failed_logins: num(counts.failed),
    top_blocked: top.map((r) => ({ who: r.who, count: num(r.n), last: r.last })),
  };
}

/** One call for the page. */
export async function getCostView({ days = 30, page = 1 } = {}) {
  const summary = await costSummary({ days });
  const [trend, perUser, auth] = await Promise.all([
    costTrend({ days }),
    perUserSpend({ days, page, meanCost: summary.mean_cost }),
    authBlocks({ days }),
  ]);
  return { summary, trend, perUser, auth, days };
}

export default { costSummary, costTrend, perUserSpend, authBlocks, getCostView };
