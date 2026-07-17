import { NextResponse } from 'next/server';
import { login } from '../../../../lib/services/authService.js';
import { setSessionCookie } from '../../../../lib/auth/session.js';
import { withRateLimit } from '../../../../lib/auth/rateLimit.js';
import { authErrorResponse } from '../../../../lib/auth/routeHelpers.js';

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
    return NextResponse.json({ ok: true });
  } catch (err) {
    // 403 = email not verified; the UI routes those users to verification.
    return authErrorResponse(err, 'Login failed', { needsVerification: err?.statusCode === 403 });
  }
}
