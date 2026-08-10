import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getConnector } from '@/lib/services/work-intelligence/connectors/registry';
import { isPlatformConfigured } from '@/lib/config/workIntelligence';
import { getActiveConnection, accessTokenOf, revokeConnection, toPublic } from '@/lib/services/work-intelligence/connectionRepository';

export const dynamic = 'force-dynamic';

// Connection status + disconnect (Phase 1.1).
export const GET = withAuth(async (user, request, { params }) => {
  const conn = await getActiveConnection(user.id, params.platform).catch(() => null);
  return NextResponse.json({ connection: toPublic(conn), configured: isPlatformConfigured(params.platform) });
});

export const DELETE = withAuth(async (user, request, { params }) => {
  const conn = await getActiveConnection(user.id, params.platform).catch(() => null);
  if (conn) {
    const connector = getConnector(params.platform);
    try { await connector?.revoke?.(accessTokenOf(conn)); } catch { /* best-effort */ }
    await revokeConnection(conn.id);
  }
  return NextResponse.json({ ok: true });
});
