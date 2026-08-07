import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { createToken, listTokens, revokeToken } from '@/lib/services/telemetry/telemetryRepository';

export const dynamic = 'force-dynamic';

// Telemetry ingestion tokens (Phase 4.1).
//   GET → list (masked) · POST { label } → create (full token returned ONCE)
//   DELETE ?token= → revoke
export const GET = withAuth(async (user) => {
  const tokens = await listTokens(user.id);
  return NextResponse.json({ tokens: tokens.map(({ token, ...rest }) => rest) }); // never re-expose full tokens
});

export const POST = withAuth(async (user, request) => {
  const { label = null } = await request.json().catch(() => ({}));
  const created = await createToken({ userId: user.id, label });
  return NextResponse.json({ token: created.token, label: created.label }, { status: 201 }); // shown once
});

export const DELETE = withAuth(async (user, request) => {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
  await revokeToken({ userId: user.id, token });
  return NextResponse.json({ ok: true });
});
