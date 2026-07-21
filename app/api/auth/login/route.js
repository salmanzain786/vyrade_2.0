import { NextResponse } from 'next/server';
import { login } from '../../../../lib/services/authService.js';
import { setSessionCookie } from '../../../../lib/auth/session.js';
import { withRateLimit } from '../../../../lib/auth/rateLimit.js';
import { authErrorResponse } from '../../../../lib/auth/routeHelpers.js';
import { trackServer, setPerson } from '../../../../lib/analytics/server.js';
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
    trackServer(EVENTS.LOGGED_IN, { distinctId: userId, email: body.email });
    setPerson(userId, { $email: body.email });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Keyed by email so failed attempts stitch to the eventual login. A 403 is
    // "email not verified" (a real user), 429 is throttling — both worth seeing.
    trackServer(EVENTS.LOGIN_FAILED, {
      distinctId: body.email || 'anonymous',
      email: body.email,
      reason: err?.message,
      status: err?.statusCode || 401,
      rate_limited: err?.statusCode === 429,
      needs_verification: err?.statusCode === 403,
    });
    // 403 = email not verified; the UI routes those users to verification.
    return authErrorResponse(err, 'Login failed', { needsVerification: err?.statusCode === 403 });
  }
}
