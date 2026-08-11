import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getConnector } from '@/lib/services/work-intelligence/connectors/registry';
import { getActiveConnection, accessTokenOf } from '@/lib/services/work-intelligence/connectionRepository';

export const dynamic = 'force-dynamic';

// The pickable project/list hierarchy for the setup screen (workspaces → spaces
// → lists), fetched live with the stored token. Returns an empty list (not an
// error) when there's no token/connector so the UI falls back to manual IDs.
export const GET = withAuth(async (user, request, { params }) => {
  const conn = await getActiveConnection(user.id, params.platform).catch(() => null);
  if (!conn) return NextResponse.json({ error: 'No active connection' }, { status: 404 });

  const connector = getConnector(params.platform);
  const token = accessTokenOf(conn);
  if (!token || !connector?.listProjects) return NextResponse.json({ projects: [] });

  try {
    const projects = await connector.listProjects(token);
    return NextResponse.json({ projects });
  } catch (err) {
    return NextResponse.json({ projects: [], error: err.message }, { status: 200 });
  }
});
