import { recordAuthAttempt, countAttempts, secondsSinceLastAttempt } from '../services/authAuditRepository.js';

// Throttling for the auth surface. Backed by the auth_attempts table (not an
// in-memory counter) so limits survive restarts and hold across instances.
//
// Two keys per event: the EMAIL (stops targeted guessing / mail-bombing one
// address) and the IP (stops one client spraying many addresses). Both must
// pass. `blocked` rows are not counted toward the limit — see countAttempts.

export class RateLimitError extends Error {
  constructor(message, retryAfterSec = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
    this.retryAfter = retryAfterSec;
  }
}

/**
 * Per-event policy.
 *  email/ip: { max, windowMin } — max real attempts per rolling window.
 *  cooldownSec: minimum gap between two sends to the same address.
 */
export const POLICIES = {
  // Credential guessing.
  login:            { email: { max: 10, windowMin: 15 }, ip: { max: 30, windowMin: 15 } },
  // Signup spam.
  register:         { email: { max: 3,  windowMin: 60 }, ip: { max: 5,  windowMin: 60 } },
  // Mail-bombing: a cooldown between codes AND an hourly cap.
  resend_otp:       { email: { max: 5,  windowMin: 60 }, ip: { max: 20, windowMin: 60 }, cooldownSec: 60 },
  // "Max reset requests per hour".
  forgot_password:  { email: { max: 3,  windowMin: 60 }, ip: { max: 10, windowMin: 60 }, cooldownSec: 60 },
  // OTP guessing (on top of the per-code 5-attempt cap).
  verify_email:     { email: { max: 10, windowMin: 15 }, ip: { max: 30, windowMin: 15 } },
  verify_reset_otp: { email: { max: 10, windowMin: 15 }, ip: { max: 30, windowMin: 15 } },
  reset_password:   { email: { max: 10, windowMin: 60 }, ip: { max: 20, windowMin: 60 } },
};

/** Best-effort client IP behind a proxy. */
export function clientIp(request) {
  const xff = request?.headers?.get?.('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request?.headers?.get?.('x-real-ip') || request?.ip || 'unknown';
}

/**
 * Throw RateLimitError if this attempt exceeds the policy. Blocked attempts are
 * themselves audited, so abuse is visible in auth_attempts.
 */
export async function enforceRateLimit({ event, email, ip }) {
  const policy = POLICIES[event];
  if (!policy) return;

  const block = async (reason, retryAfter) => {
    await recordAuthAttempt({ event, email, ip, outcome: 'blocked', reason });
    throw new RateLimitError(
      reason === 'cooldown'
        ? `Please wait ${retryAfter}s before requesting another code.`
        : 'Too many attempts. Please try again later.',
      retryAfter
    );
  };

  if (policy.cooldownSec && email) {
    // Elapsed seconds come from the DB clock — see authAuditRepository.
    const ago = await secondsSinceLastAttempt({ event, email });
    if (ago !== null && ago >= 0 && ago < policy.cooldownSec) {
      await block('cooldown', Math.max(1, Math.ceil(policy.cooldownSec - ago)));
    }
  }

  if (policy.email && email) {
    const n = await countAttempts({ event, email, windowMin: policy.email.windowMin });
    if (n >= policy.email.max) await block('email_rate_limit', policy.email.windowMin * 60);
  }

  if (policy.ip && ip && ip !== 'unknown') {
    const n = await countAttempts({ event, ip, windowMin: policy.ip.windowMin });
    if (n >= policy.ip.max) await block('ip_rate_limit', policy.ip.windowMin * 60);
  }
}

/**
 * Wrap an auth handler: enforce the limit, run it, then audit the outcome.
 * The handler may return { userId } so the audit row can name the account.
 *
 *   const r = await withRateLimit({ request, event: 'login', email }, () => login(body));
 */
export async function withRateLimit({ request, event, email }, handler) {
  const ip = clientIp(request);
  await enforceRateLimit({ event, email, ip });
  try {
    const result = await handler();
    await recordAuthAttempt({ event, email, ip, userId: result?.userId ?? null, outcome: 'success' });
    return result;
  } catch (err) {
    await recordAuthAttempt({ event, email, ip, outcome: 'failure', reason: err?.message });
    throw err;
  }
}
