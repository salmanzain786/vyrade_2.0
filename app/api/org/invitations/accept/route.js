import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { acceptInvitation } from '@/lib/services/org/invitationRepository';

export const dynamic = 'force-dynamic';

// Accept an org invitation (Phase 2.2). POST { token }.
export const POST = withAuth(async (user, request) => {
  const { token } = await request.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
  try {
    const membership = await acceptInvitation({ token, userId: user.id });
    return NextResponse.json({ ok: true, membership });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
});
