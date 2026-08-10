import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { listOpportunities } from '@/lib/services/work-intelligence/patterns/opportunityRepository';

export const dynamic = 'force-dynamic';

// The Automation Opportunity Map (Phase 3.2). Lists the user's detected opportunities.
export const GET = withAuth(async (user, request) => {
  const status = new URL(request.url).searchParams.get('status') || null;
  const opportunities = await listOpportunities(user.id, { status }).catch(() => []);
  return NextResponse.json({ opportunities });
});
