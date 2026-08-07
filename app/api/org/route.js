import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getMembership, createOrganization } from '@/lib/services/org/membershipRepository';

export const dynamic = 'force-dynamic';

// Organisation (Phase 2.1).
//   GET  → the caller's membership (null if none)
//   POST { name, department? } → create an org (caller becomes owner)
export const GET = withAuth(async (user) => {
  const membership = await getMembership(user.id).catch(() => null);
  return NextResponse.json({ membership });
});

export const POST = withAuth(async (user, request) => {
  const { name, department = null } = await request.json().catch(() => ({}));
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'Organisation name is required' }, { status: 400 });
  try {
    const membership = await createOrganization({ userId: user.id, name, department });
    return NextResponse.json({ membership }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
});
