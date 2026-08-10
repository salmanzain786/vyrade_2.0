import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getOwnedSession, saveAnswers } from '@/lib/services/work-intelligence/discovery/discoveryRepository';

export const dynamic = 'force-dynamic';

// Discovery session (Phase 2.3). GET the session; PUT { answers } to save.
export const GET = withAuth(async (user, request, { params }) => {
  const s = await getOwnedSession(params.id, user.id);
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ session: s });
});

export const PUT = withAuth(async (user, request, { params }) => {
  const s = await getOwnedSession(params.id, user.id);
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { answers } = await request.json().catch(() => ({}));
  const updated = await saveAnswers(params.id, answers || {});
  return NextResponse.json({ session: updated });
});
