import { NextResponse } from 'next/server';
import { verifyResetOtp, AuthError } from '../../../../lib/services/authService.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { resetToken } = await verifyResetOtp(body);
    // The reset token authorizes the final password change.
    return NextResponse.json({ ok: true, resetToken });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error(err);
    return NextResponse.json({ error: 'Could not verify code' }, { status: 500 });
  }
}
