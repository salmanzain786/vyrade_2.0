import { NextResponse } from 'next/server';
import { registerUser } from '../../../../lib/services/authService.js';
import { withRateLimit } from '../../../../lib/auth/rateLimit.js';
import { authErrorResponse } from '../../../../lib/auth/routeHelpers.js';
import { trackServer, setPerson } from '../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../lib/analytics/events.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    // Caps signup spam per IP, and repeated "register" sends to one address
    // (registerUser re-sends verification for an existing unverified account).
    const { userId, email, resent } = await withRateLimit(
      { request, event: 'register', email: body.email },
      () => registerUser(body)
    );
    trackServer(EVENTS.SIGNED_UP, { distinctId: userId, email, resent: !!resent });
    if (!resent) setPerson(userId, { $name: body.name, $email: email, signup_source: 'web' });
    return NextResponse.json(
      { ok: true, email, resent, message: 'We sent a 6-digit verification code to your email.' },
      { status: 201 }
    );
  } catch (err) {
    return authErrorResponse(err, 'Registration failed');
  }
}
