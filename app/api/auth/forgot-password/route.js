import { NextResponse } from 'next/server';
import { requestPasswordReset } from '../../../../lib/services/authService.js';
import { withRateLimit } from '../../../../lib/auth/rateLimit.js';
import { authErrorResponse } from '../../../../lib/auth/routeHelpers.js';
import { trackServer } from '../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../lib/analytics/events.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    // Max 3 reset requests per hour per address, with a 60s cooldown — this
    // sends mail to a real inbox and the response is deliberately generic, so
    // without throttling it could be used to mail-bomb someone.
    await withRateLimit(
      { request, event: 'forgot_password', email: body.email },
      () => requestPasswordReset(body)
    );
    trackServer(EVENTS.PASSWORD_RESET_REQUESTED, { distinctId: body.email || 'anonymous', email: body.email });
    // Generic regardless of whether the email exists (no enumeration).
    return NextResponse.json({ ok: true, message: 'If an account exists for that email, a reset code is on its way.' });
  } catch (err) {
    return authErrorResponse(err, 'Could not start password reset');
  }
}
