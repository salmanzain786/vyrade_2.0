import { NextResponse } from 'next/server';
import { login } from '../../../../lib/services/authService.js';
import { setSessionCookie } from '../../../../lib/auth/session.js';
import { withRateLimit } from '../../../../lib/auth/rateLimit.js';
import { authErrorResponse } from '../../../../lib/auth/routeHelpers.js';
import { trackServer, setPerson } from '../../../../lib/analytics/server.js';
import { errorCategory } from '../../../../lib/analytics/sanitize.js';
import { EVENTS } from '../../../../lib/analytics/events.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    // Throttled per email + per IP; every attempt lands in the audit log.
    const { userId } = await withRateLimit(
      { request, event: 'login', email: body.email },
      () => login(body)
    );
    setSessionCookie(userId);
    trackServer(EVENTS.LOGGED_IN, { userId });
    setPerson(userId, { $email: body.email });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Pre-auth: the email is pseudonymized (HMAC) into the distinct_id so the
    // funnel stitches to the eventual login without exposing the address, and
    // the raw error is reduced to a category. 403 = unverified, 429 = throttled.
    trackServer(EVENTS.LOGIN_FAILED, {
      email: body.email,
      status_code: err?.statusCode || 401,
      error_category: errorCategory(err?.statusCode || 401),
      rate_limited: err?.statusCode === 429,
      needs_verification: err?.statusCode === 403,
    });
    // 403 = email not verified; the UI routes those users to verification.
    return authErrorResponse(err, 'Login failed', { needsVerification: err?.statusCode === 403 });
  }
}
