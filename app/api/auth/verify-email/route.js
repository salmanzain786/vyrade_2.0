import { NextResponse } from 'next/server';
import { verifyEmail, AuthError } from '../../../../lib/services/authService.js';
import { setSessionCookie } from '../../../../lib/auth/session.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId } = await verifyEmail(body);
    // Verifying the email also logs the user in.
    setSessionCookie(userId);
    return NextResponse.json({ ok: true, message: 'Email verified. You are now signed in.' });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error(err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
