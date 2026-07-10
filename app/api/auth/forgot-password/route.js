import { NextResponse } from 'next/server';
import { requestPasswordReset, AuthError } from '../../../../lib/services/authService.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    await requestPasswordReset(body);
    // Generic response regardless of whether the email exists (no enumeration).
    return NextResponse.json({ ok: true, message: 'If an account exists for that email, a reset code is on its way.' });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error(err);
    return NextResponse.json({ error: 'Could not start password reset' }, { status: 500 });
  }
}
