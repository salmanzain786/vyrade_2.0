import { NextResponse } from 'next/server';
import { verifyEmail } from '../../../../lib/services/authService.js';
import { setSessionCookie } from '../../../../lib/auth/session.js';
import { withRateLimit } from '../../../../lib/auth/rateLimit.js';
import { authErrorResponse } from '../../../../lib/auth/routeHelpers.js';
import { trackServer, setPerson } from '../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../lib/analytics/events.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    // Caps OTP guessing across codes (the per-code 5-attempt limit only guards
    // a single issued code — a client could otherwise re-request and retry).
    const { userId } = await withRateLimit(
      { request, event: 'verify_email', email: body.email },
      () => verifyEmail(body)
    );
    // Verifying the email also logs the user in.
    setSessionCookie(userId);
    trackServer(EVENTS.EMAIL_VERIFIED, { distinctId: userId, email: body.email });
    setPerson(userId, { $email: body.email, email_verified: true });
    return NextResponse.json({ ok: true, message: 'Email verified. You are now signed in.' });
  } catch (err) {
    return authErrorResponse(err, 'Verification failed');
  }
}
