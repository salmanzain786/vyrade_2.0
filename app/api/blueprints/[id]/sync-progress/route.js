import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { assertBlueprintOwner } from '@/lib/auth/ownership';
import { syncBlueprintProgress } from '@/lib/services/work-intelligence/writeback/sync';

export const dynamic = 'force-dynamic';

// Write-back progress to the originating task (Phase 4.2). Gated by the
// connection's separate write-back permission (enforced inside the service).
export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);
  const appOrigin = new URL(request.url).origin;
  try {
    const result = await syncBlueprintProgress({ userId: user.id, blueprintId: params.id, appOrigin });
    if (!result.ok) return NextResponse.json(result, { status: result.reason === 'write_back_disabled' ? 403 : 409 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `Sync failed: ${err.message}` }, { status: 502 });
  }
});
