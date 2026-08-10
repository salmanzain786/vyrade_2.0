import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getActiveConnection } from '@/lib/services/work-intelligence/connectionRepository';
import { syncConnection } from '@/lib/services/work-intelligence/sync';

export const dynamic = 'force-dynamic';

// "Sync now" (Phase 1 assembly). Fetches in-scope tasks, enforces scope +
// opt-outs, sanitizes, and stores them. Ownership-gated via the session.
export const POST = withAuth(async (user, request, { params }) => {
  const conn = await getActiveConnection(user.id, params.platform).catch(() => null);
  if (!conn) return NextResponse.json({ error: 'No active connection' }, { status: 404 });
  try {
    const result = await syncConnection({ connection: conn });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `Sync failed: ${err.message}` }, { status: 502 });
  }
});
