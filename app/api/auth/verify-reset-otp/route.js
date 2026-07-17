import { NextResponse } from 'next/server';
import { verifyResetOtp } from '../../../../lib/services/authService.js';
import { withRateLimit } from '../../../../lib/auth/rateLimit.js';
import { authErrorResponse } from '../../../../lib/auth/routeHelpers.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    // Same OTP-guessing cap as email verification.
    const { resetToken } = await withRateLimit(
      { request, event: 'verify_reset_otp', email: body.email },
      () => verifyResetOtp(body)
    );
    // The reset token authorizes the final password change.
    return NextResponse.json({ ok: true, resetToken });
  } catch (err) {
    return authErrorResponse(err, 'Could not verify code');
  }
}
