import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { withAuth } from '@/lib/auth/guard';
import { createToken } from '@/lib/auth/token';
import { getConnector } from '@/lib/services/work-intelligence/connectors/registry';
import { getPlatformCredentials, isPlatformConfigured } from '@/lib/config/workIntelligence';

export const dynamic = 'force-dynamic';

// Start the OAuth flow (Phase 1.1). Signs a short-lived state token bound to the
// user + platform, then redirects to the platform's consent screen.
export const GET = withAuth(async (user, request, { params }) => {
  const platform = params.platform;
  const connector = getConnector(platform);
  if (!connector) return NextResponse.json({ error: `Unknown platform "${platform}"` }, { status: 404 });
  if (!isPlatformConfigured(platform)) return NextResponse.json({ error: `${platform} OAuth is not configured (missing client id/secret).` }, { status: 400 });

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/${platform}/callback`;
  const state = createToken({ uid: user.id, platform, n: randomUUID() }, 600); // 10-min state
  const { clientId } = getPlatformCredentials(platform);
  return NextResponse.redirect(connector.authorizeUrl({ clientId, redirectUri, state }));
});
