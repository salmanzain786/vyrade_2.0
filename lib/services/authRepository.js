import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users, authOtps } from '../db/schema.js';
import { hashOtp, otpExpiry, OTP_MAX_ATTEMPTS } from '../auth/otp.js';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// --- Users ---

export async function getUserById(id) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row || null;
}

export async function getUserByEmail(email) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return row || null;
}

export async function createUser({ name, email, passwordHash }) {
  const id = uuidv4();
  await db.insert(users).values({
    id,
    name: String(name).trim(),
    email: normalizeEmail(email),
    passwordHash,
    emailVerified: 0,
  });
  return getUserById(id);
}

export async function markEmailVerified(userId) {
  await db.update(users).set({ emailVerified: 1 }).where(eq(users.id, userId));
}

export async function updatePassword(userId, passwordHash) {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// --- One-time passcodes ---

/**
 * Issue a fresh OTP for a purpose, invalidating any prior unconsumed codes of
 * the same purpose so only the newest code works. Returns the plain code so the
 * caller can email it — it is stored only as a hash.
 */
export async function issueOtp(userId, purpose, plainCode) {
  // Retire outstanding codes for this (user, purpose).
  await db
    .update(authOtps)
    .set({ consumedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(
      eq(authOtps.userId, userId),
      eq(authOtps.purpose, purpose),
      isNull(authOtps.consumedAt),
    ));

  await db.insert(authOtps).values({
    id: uuidv4(),
    userId,
    purpose,
    codeHash: hashOtp(plainCode),
    expiresAt: otpExpiry(),
  });
}

/**
 * Validate the newest unconsumed OTP for (user, purpose) against a submitted
 * code, consuming it on success. Returns one of:
 *   { ok: true }
 *   { ok: false, reason: 'no_code' | 'expired' | 'too_many_attempts' | 'mismatch' }
 */
export async function consumeOtp(userId, purpose, submittedCode) {
  const [row] = await db
    .select()
    .from(authOtps)
    .where(and(
      eq(authOtps.userId, userId),
      eq(authOtps.purpose, purpose),
      isNull(authOtps.consumedAt),
    ))
    .orderBy(desc(authOtps.createdAt))
    .limit(1);

  if (!row) return { ok: false, reason: 'no_code' };

  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await db.update(authOtps).set({ consumedAt: sql`CURRENT_TIMESTAMP` }).where(eq(authOtps.id, row.id));
    return { ok: false, reason: 'expired' };
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await db.update(authOtps).set({ consumedAt: sql`CURRENT_TIMESTAMP` }).where(eq(authOtps.id, row.id));
    return { ok: false, reason: 'too_many_attempts' };
  }

  if (row.codeHash !== hashOtp(submittedCode)) {
    await db
      .update(authOtps)
      .set({ attempts: row.attempts + 1 })
      .where(eq(authOtps.id, row.id));
    return { ok: false, reason: 'mismatch', attemptsLeft: OTP_MAX_ATTEMPTS - (row.attempts + 1) };
  }

  await db.update(authOtps).set({ consumedAt: sql`CURRENT_TIMESTAMP` }).where(eq(authOtps.id, row.id));
  return { ok: true };
}
