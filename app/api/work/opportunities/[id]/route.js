import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getOpportunity, canActOnOpportunity, setStatus } from '@/lib/services/work-intelligence/patterns/opportunityRepository';

export const dynamic = 'force-dynamic';

// Opportunity review (Phase 3.3). The creator OR an owner/admin/manager of the
// same org may confirm/dismiss — reusing the org access model.
export const PUT = withAuth(async (user, request, { params }) => {
  const opp = await getOpportunity(params.id);
  if (!opp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canActOnOpportunity(opp, user.id))) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  const { status } = await request.json().catch(() => ({}));
  try {
    const updated = await setStatus(params.id, status);
    return NextResponse.json({ opportunity: updated });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
});
