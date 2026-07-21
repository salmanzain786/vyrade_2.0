import { NextResponse } from 'next/server';
import { resendVerification } from '../../../../lib/services/authService.js';
import { withRateLimit } from '../../../../lib/auth/rateLimit.js';
import { authErrorResponse } from '../../../../lib/auth/routeHelpers.js';
import { trackServer } from '../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../lib/analytics/events.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    // 60s cooldown + 5/hour per address — this endpoint mails a real person.
    await withRateLimit(
      { request, event: 'resend_otp', email: body.email },
      () => resendVerification(body)
    );
    trackServer(EVENTS.OTP_RESENT, { distinctId: body.email || 'anonymous', email: body.email, context: 'verify_email' });
    // Always generic — never reveals whether the account exists / is verified.
    return NextResponse.json({ ok: true, message: 'If your account needs verification, a new code is on its way.' });
  } catch (err) {
    return authErrorResponse(err, 'Could not resend code');
  }
}
