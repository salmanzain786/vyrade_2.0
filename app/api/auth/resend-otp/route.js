import { NextResponse } from 'next/server';
import { resendVerification, AuthError } from '../../../../lib/services/authService.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    await resendVerification(body);
    // Always generic — never reveals whether the account exists / is verified.
    return NextResponse.json({ ok: true, message: 'If your account needs verification, a new code is on its way.' });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error(err);
    return NextResponse.json({ error: 'Could not resend code' }, { status: 500 });
  }
}
