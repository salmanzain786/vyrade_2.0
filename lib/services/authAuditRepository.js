import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { authAttempts } from '../db/schema.js';

// Every auth event is written here — that's the audit trail — and the same rows
// are counted to enforce rate limits.
//
// All time math happens IN SQL (NOW() / TIMESTAMPDIFF) rather than against
// Date.now(). `created_at` is written by MySQL's CURRENT_TIMESTAMP in the DB's
// session timezone; comparing that to the Node process clock silently breaks
// whenever the two timezones differ (elapsed goes negative → cooldowns report
// absurd waits and rolling windows never expire, locking users out).

const normalizeEmail = (e) => (e ? String(e).trim().toLowerCase() : null);
// windowMin comes from our own POLICIES table (trusted ints), inlined so MySQL
// gets a literal INTERVAL rather than a placeholder.
const minutes = (n) => sql.raw(String(Math.max(0, Number(n) || 0)));

/**
 * Record one auth attempt. Never throws — auditing must not break the auth flow
 * (a failed log is reported to the console instead of failing the request).
 */
export async function recordAuthAttempt({ event, email = null, ip = null, userId = null, outcome, reason = null }) {
  try {
    await db.insert(authAttempts).values({
      event,
      email: normalizeEmail(email),
      ip: ip ? String(ip).slice(0, 45) : null,
      userId,
      outcome,
      reason: reason ? String(reason).slice(0, 160) : null,
    });
  } catch (err) {
    console.error('[audit] failed to record auth attempt:', err.message);
  }
}

/**
 * Count real attempts (success/failure) for a key in a rolling window.
 * `blocked` rows are excluded on purpose: counting our own rejections would let
 * a client extend their own lockout indefinitely by retrying.
 */
export async function countAttempts({ event, email = null, ip = null, windowMin }) {
  const where = [
    eq(authAttempts.event, event),
    sql`${authAttempts.createdAt} > (NOW() - INTERVAL ${minutes(windowMin)} MINUTE)`,
    sql`${authAttempts.outcome} <> 'blocked'`,
  ];
  if (email) where.push(eq(authAttempts.email, normalizeEmail(email)));
  if (ip) where.push(eq(authAttempts.ip, String(ip)));

  const [row] = await db
    .select({ n: sql`COUNT(*)`.mapWith(Number) })
    .from(authAttempts)
    .where(and(...where));
  return row?.n || 0;
}

/**
 * Seconds since we last actually did something for this (event, email) — used
 * for send cooldowns. Computed by the database so it can't be skewed by the
 * app server's timezone. Returns null when there's no prior attempt.
 */
export async function secondsSinceLastAttempt({ event, email }) {
  if (!email) return null;
  const [row] = await db
    .select({ ago: sql`TIMESTAMPDIFF(SECOND, ${authAttempts.createdAt}, NOW())`.mapWith(Number) })
    .from(authAttempts)
    .where(and(
      eq(authAttempts.event, event),
      eq(authAttempts.email, normalizeEmail(email)),
      sql`${authAttempts.outcome} <> 'blocked'`,
    ))
    .orderBy(desc(authAttempts.createdAt))
    .limit(1);
  return row ? row.ago : null;
}
