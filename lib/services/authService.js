import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { generateOtp } from '../auth/otp.js';
import { createToken, verifyToken } from '../auth/token.js';
import { sendOtpEmail } from './mailer.js';
import * as repo from './authRepository.js';

// Domain error the routes translate into an HTTP status.
export class AuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

const PURPOSE = { VERIFY: 'email_verification', RESET: 'password_reset' };
const RESET_TOKEN_TTL = 15 * 60; // 15 min to move from OTP → new password

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long');
const nameSchema = z.string().trim().min(1, 'Name is required').max(120);
const codeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AuthError(result.error.issues[0]?.message || 'Invalid input', 400);
  }
  return result.data;
}

async function issueAndSendOtp(user, purpose) {
  const code = generateOtp();
  await repo.issueOtp(user.id, purpose, code);
  await sendOtpEmail({ to: user.email, name: user.name, code, purpose });
}

// --- Registration + email verification ---

export async function registerUser(input) {
  const { name, email, password } = parse(
    z.object({ name: nameSchema, email: emailSchema, password: passwordSchema }),
    input
  );

  const existing = await repo.getUserByEmail(email);
  if (existing) {
    // A registered-but-unverified account can re-trigger verification instead
    // of being told the email is taken.
    if (!existing.emailVerified) {
      await issueAndSendOtp(existing, PURPOSE.VERIFY);
      return { userId: existing.id, email: existing.email, resent: true };
    }
    throw new AuthError('An account with this email already exists', 409);
  }

  const passwordHash = await hashPassword(password);
  const user = await repo.createUser({ name, email, passwordHash });
  await issueAndSendOtp(user, PURPOSE.VERIFY);
  return { userId: user.id, email: user.email, resent: false };
}

export async function resendVerification(input) {
  const email = parse(emailSchema, input.email);
  const user = await repo.getUserByEmail(email);
  // Don't reveal whether the account exists / is already verified.
  if (user && !user.emailVerified) await issueAndSendOtp(user, PURPOSE.VERIFY);
}

/** Verify the email OTP. Returns the user id so the route can open a session. */
export async function verifyEmail(input) {
  const email = parse(emailSchema, input.email);
  const code = parse(codeSchema, input.code);

  const user = await repo.getUserByEmail(email);
  if (!user) throw new AuthError('Invalid code or email', 400);
  if (user.emailVerified) return { userId: user.id, alreadyVerified: true };

  const result = await repo.consumeOtp(user.id, PURPOSE.VERIFY, code);
  if (!result.ok) throw new AuthError(otpErrorMessage(result), 400);

  await repo.markEmailVerified(user.id);
  return { userId: user.id, alreadyVerified: false };
}

// --- Login ---

export async function login(input) {
  const email = parse(emailSchema, input.email);
  const password = parse(z.string().min(1, 'Password is required'), input.password);

  const user = await repo.getUserByEmail(email);
  // Same generic message whether the email is unknown or the password is wrong.
  const invalid = new AuthError('Invalid email or password', 401);
  if (!user) throw invalid;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw invalid;

  if (!user.emailVerified) {
    // Nudge them back into the verification flow (and resend a code).
    await issueAndSendOtp(user, PURPOSE.VERIFY);
    throw new AuthError('Please verify your email first — we sent you a new code', 403);
  }

  return { userId: user.id };
}

// --- Password reset ---

export async function requestPasswordReset(input) {
  const email = parse(emailSchema, input.email);
  const user = await repo.getUserByEmail(email);
  // Always succeed silently so the endpoint can't be used to enumerate emails.
  if (user) await issueAndSendOtp(user, PURPOSE.RESET);
}

/** Validate the reset OTP and hand back a short-lived signed reset token. */
export async function verifyResetOtp(input) {
  const email = parse(emailSchema, input.email);
  const code = parse(codeSchema, input.code);

  const user = await repo.getUserByEmail(email);
  if (!user) throw new AuthError('Invalid code or email', 400);

  const result = await repo.consumeOtp(user.id, PURPOSE.RESET, code);
  if (!result.ok) throw new AuthError(otpErrorMessage(result), 400);

  const resetToken = createToken({ uid: user.id, scope: 'password_reset' }, RESET_TOKEN_TTL);
  return { resetToken };
}

export async function resetPassword(input) {
  const { resetToken, password } = parse(
    z.object({ resetToken: z.string().min(1, 'Reset token missing'), password: passwordSchema }),
    input
  );

  const payload = verifyToken(resetToken);
  if (!payload || payload.scope !== 'password_reset' || !payload.uid) {
    throw new AuthError('Your reset link has expired. Start over.', 400);
  }

  const user = await repo.getUserById(payload.uid);
  if (!user) throw new AuthError('Account no longer exists', 400);

  await repo.updatePassword(user.id, await hashPassword(password));
  return { userId: user.id };
}

function otpErrorMessage(result) {
  switch (result.reason) {
    case 'no_code': return 'No active code — request a new one';
    case 'expired': return 'That code has expired — request a new one';
    case 'too_many_attempts': return 'Too many attempts — request a new code';
    case 'mismatch':
      return result.attemptsLeft > 0
        ? `Incorrect code — ${result.attemptsLeft} attempt(s) left`
        : 'Incorrect code — request a new one';
    default: return 'Invalid code';
  }
}
