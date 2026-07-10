import { NextResponse } from 'next/server';
import { login, AuthError } from '../../../../lib/services/authService.js';
import { setSessionCookie } from '../../../../lib/auth/session.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId } = await login(body);
    setSessionCookie(userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      // 403 = email not verified; the UI routes those users to verification.
      return NextResponse.json(
        { error: err.message, needsVerification: err.statusCode === 403 },
        { status: err.statusCode }
      );
    }
    console.error(err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
