import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getActiveConnection, setScope, setGovernance, toPublic } from '@/lib/services/work-intelligence/connectionRepository';

export const dynamic = 'force-dynamic';

// Update scope (1.3) and/or governance (1.4) for a connection.
//   PUT { scope?, governance? }
export const PUT = withAuth(async (user, request, { params }) => {
  const conn = await getActiveConnection(user.id, params.platform).catch(() => null);
  if (!conn) return NextResponse.json({ error: 'No active connection' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  let updated = conn;
  if (body.scope) updated = await setScope(conn.id, body.scope);
  if (body.governance) updated = await setGovernance(conn.id, body.governance);
  return NextResponse.json({ connection: toPublic(updated) });
});
