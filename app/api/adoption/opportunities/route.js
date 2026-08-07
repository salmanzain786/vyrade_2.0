import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { setOpportunityStatus } from '@/lib/services/adoption/opportunityRepository';
import { recordAdoptionEvent } from '@/lib/services/adoption/adoptionRepository';
import { STAGES } from '@/lib/services/adoption/stages';

export const dynamic = 'force-dynamic';

// Opportunity status (Phase 1.2/1.3).
//   PUT { areaKey, status } → update status; fires the matching progression event
const STATUS_TO_STAGE = { discovered: STAGES.DISCOVERED, considered: STAGES.CONSIDERED };

export const PUT = withAuth(async (user, request) => {
  const { areaKey, status } = await request.json().catch(() => ({}));
  if (!areaKey || !status) return NextResponse.json({ error: 'areaKey and status are required' }, { status: 400 });
  try {
    await setOpportunityStatus({ userId: user.id, areaKey, status });
    if (STATUS_TO_STAGE[status]) recordAdoptionEvent({ userId: user.id, stage: STATUS_TO_STAGE[status], areaKey });
    return NextResponse.json({ ok: true, areaKey, status });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
});
