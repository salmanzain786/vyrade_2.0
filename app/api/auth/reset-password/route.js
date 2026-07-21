import { NextResponse } from 'next/server';
import { resetPassword } from '../../../../lib/services/authService.js';
import { withRateLimit } from '../../../../lib/auth/rateLimit.js';
import { authErrorResponse } from '../../../../lib/auth/routeHelpers.js';
import { trackServer } from '../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../lib/analytics/events.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    // The caller proves itself with a signed reset token, so there's no email in
    // the body — this is IP-throttled and audited (the audit row gets the userId
    // the token resolved to).
    const { userId } = await withRateLimit(
      { request, event: 'reset_password', email: null },
      () => resetPassword(body)
    );
    trackServer(EVENTS.PASSWORD_RESET_COMPLETED, { distinctId: userId });
    return NextResponse.json({ ok: true, message: 'Password updated. You can now sign in.' });
  } catch (err) {
    return authErrorResponse(err, 'Could not reset password');
  }
}
