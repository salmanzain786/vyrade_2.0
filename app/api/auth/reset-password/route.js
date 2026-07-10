import { NextResponse } from 'next/server';
import { resetPassword, AuthError } from '../../../../lib/services/authService.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    await resetPassword(body);
    return NextResponse.json({ ok: true, message: 'Password updated. You can now sign in.' });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error(err);
    return NextResponse.json({ error: 'Could not reset password' }, { status: 500 });
  }
}
