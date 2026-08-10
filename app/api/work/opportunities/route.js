import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { listOpportunities, listOrgOpportunities } from '@/lib/services/work-intelligence/patterns/opportunityRepository';
import { getMembership } from '@/lib/services/org/membershipRepository';
import { canReviewOpportunities } from '@/lib/services/org/access';

export const dynamic = 'force-dynamic';

// The Automation Opportunity Map (Phase 3.2). Personal by default; a manager/admin
// can request the team-wide view (?scope=org).
export const GET = withAuth(async (user, request) => {
  const sp = new URL(request.url).searchParams;
  const status = sp.get('status') || null;
  if (sp.get('scope') === 'org') {
    const m = await getMembership(user.id).catch(() => null);
    if (!m || !canReviewOpportunities(m.role)) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
    return NextResponse.json({ opportunities: await listOrgOpportunities(m.org_id), scope: 'org' });
  }
  const opportunities = await listOpportunities(user.id, { status }).catch(() => []);
  return NextResponse.json({ opportunities, scope: 'personal' });
});
