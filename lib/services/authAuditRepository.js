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
  // Background, at most hourly, never awaited — keeps the table bounded even
  // when no cron is configured.
  maybePruneAuthAttempts();
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

// --- Retention -------------------------------------------------------------
// auth_attempts holds email + IP, so it must not grow forever: it's both a
// storage problem and a personal-data one. Two tiers:
//   0 .. ANONYMIZE_AFTER_DAYS  full detail (rate limiting needs ≤ 60 min;
//                              the rest is for incident investigation)
//   .. RETAIN_DAYS             email/ip stripped, event/outcome/time kept so
//                              security trends survive without the PII
//   > RETAIN_DAYS              deleted
const intEnv = (name, fallback) => {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function retentionPolicy() {
  const anonymizeAfterDays = intEnv('AUTH_AUDIT_ANONYMIZE_AFTER_DAYS', 30);
  const retainDays = intEnv('AUTH_AUDIT_RETAIN_DAYS', 90);
  // Anonymizing after deletion would be a no-op; keep the tiers ordered.
  return { anonymizeAfterDays: Math.min(anonymizeAfterDays, retainDays), retainDays };
}

const days = (n) => sql.raw(String(Math.max(1, Number(n) || 1)));

/**
 * Apply the retention policy. Deletes in batches so a large backlog can't hold
 * a long table lock. Safe to run repeatedly (idempotent).
 * @returns {{ anonymized: number, deleted: number, policy: object }}
 */
export async function pruneAuthAttempts(overrides = {}) {
  const policy = { ...retentionPolicy(), ...overrides };
  const { anonymizeAfterDays, retainDays } = policy;

  // 1) Strip PII from rows past the detail window (but still within retention).
  const anonRes = await db
    .update(authAttempts)
    .set({ email: null, ip: null })
    .where(and(
      sql`${authAttempts.createdAt} < (NOW() - INTERVAL ${days(anonymizeAfterDays)} DAY)`,
      sql`(${authAttempts.email} IS NOT NULL OR ${authAttempts.ip} IS NOT NULL)`,
    ));
  const anonymized = anonRes?.[0]?.affectedRows ?? anonRes?.affectedRows ?? 0;

  // 2) Delete anything past the retention window, in batches.
  let deleted = 0;
  for (;;) {
    const res = await db.execute(
      sql`DELETE FROM ${authAttempts}
           WHERE ${authAttempts.createdAt} < (NOW() - INTERVAL ${days(retainDays)} DAY)
           LIMIT 5000`
    );
    const n = res?.[0]?.affectedRows ?? res?.affectedRows ?? 0;
    deleted += n;
    if (n < 5000) break;
  }

  return { anonymized, deleted, policy };
}

// Opportunistic prune so a deployment without cron doesn't grow forever.
// Runs at most once an hour, in the background, and never affects the request.
let lastPruneAt = 0;
export function maybePruneAuthAttempts() {
  const HOUR = 60 * 60 * 1000;
  if (Date.now() - lastPruneAt < HOUR) return;
  lastPruneAt = Date.now();
  pruneAuthAttempts()
    .then(({ anonymized, deleted }) => {
      if (anonymized || deleted) {
        console.log(`[audit] retention: anonymized ${anonymized}, deleted ${deleted}`);
      }
    })
    .catch((err) => console.error('[audit] retention prune failed:', err.message));
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
