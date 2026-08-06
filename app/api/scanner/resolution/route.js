import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { assertBlueprintOwner } from '@/lib/auth/ownership';
import { setResolution } from '@/lib/services/scanner/scanRepository';

export const dynamic = 'force-dynamic';

// Resolution tracking (Phase 7.2).
//   PUT { blueprintId, type, node?, status, note? }
//   status ∈ open | in_progress | resolved | accepted_risk  (open clears it)
export const PUT = withAuth(async (user, request) => {
  const body = await request.json().catch(() => ({}));
  const { blueprintId, type, node = null, status, note = null } = body;
  if (!blueprintId || !type || !status) {
    return NextResponse.json({ error: 'blueprintId, type and status are required' }, { status: 400 });
  }
  await assertBlueprintOwner(user, blueprintId);
  try {
    const res = await setResolution({ blueprintId, findingType: type, node, status, note, userId: user.id });
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
});
