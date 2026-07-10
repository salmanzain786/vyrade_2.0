import { NextResponse } from 'next/server';
import { registerUser, AuthError } from '../../../../lib/services/authService.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, resent } = await registerUser(body);
    return NextResponse.json(
      {
        ok: true,
        email,
        resent,
        message: 'We sent a 6-digit verification code to your email.',
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error(err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
