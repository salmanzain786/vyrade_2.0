import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getOwnedOpportunity, setStatus } from '@/lib/services/work-intelligence/patterns/opportunityRepository';

export const dynamic = 'force-dynamic';

// Manager opportunity review (Phase 3.3). PUT { status } — confirm/dismiss.
export const PUT = withAuth(async (user, request, { params }) => {
  const opp = await getOwnedOpportunity(params.id, user.id);
  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { status } = await request.json().catch(() => ({}));
  try {
    const updated = await setStatus(params.id, user.id, status);
    return NextResponse.json({ opportunity: updated });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
});
