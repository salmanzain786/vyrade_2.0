import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getOwnedSession, saveAnswers } from '@/lib/services/work-intelligence/discovery/discoveryRepository';
import { createBlueprintFromDiscovery } from '@/lib/services/work-intelligence/discovery/generate';

export const dynamic = 'force-dynamic';

// Generate the draft Blueprint from a discovery session (Phase 2.4). Optionally
// accepts the latest answers to persist first.
//   POST { answers? } → { blueprintId }
export const POST = withAuth(async (user, request, { params }) => {
  let s = await getOwnedSession(params.id, user.id);
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  if (body.answers) s = await saveAnswers(params.id, { ...s.answers, ...body.answers });

  try {
    const result = await createBlueprintFromDiscovery({ discovery: s, userId: user.id });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `Blueprint generation failed: ${err.message}` }, { status: 422 });
  }
});
