import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { verifyToken } from '@/lib/auth/token';
import { getConnector } from '@/lib/services/work-intelligence/connectors/registry';
import { getPlatformCredentials } from '@/lib/config/workIntelligence';
import { createConnection } from '@/lib/services/work-intelligence/connectionRepository';
import { getMembership } from '@/lib/services/org/membershipRepository';

export const dynamic = 'force-dynamic';

// OAuth callback (Phase 1.1). Verifies the signed state, exchanges the code, and
// stores an encrypted connection. Then redirects to the setup screen.
export const GET = withAuth(async (user, request, { params }) => {
  const platform = params.platform;
  const connector = getConnector(platform);
  const origin = new URL(request.url).origin;
  const back = (q) => NextResponse.redirect(`${origin}/integrations/task-management?${q}`);

  if (!connector) return back(`error=unknown_platform`);
  const sp = new URL(request.url).searchParams;
  const code = sp.get('code');
  const state = sp.get('state');
  const payload = state ? verifyToken(state) : null;
  if (!payload || payload.uid !== user.id || payload.platform !== platform) return back('error=invalid_state');
  if (!code) return back(`error=${sp.get('error') || 'no_code'}`);

  try {
    const { clientId, clientSecret } = getPlatformCredentials(platform);
    const tokens = await connector.exchangeCode({ clientId, clientSecret, code });
    const account = await connector.getAccount(tokens.accessToken);
    const membership = await getMembership(user.id).catch(() => null);
    await createConnection({ userId: user.id, orgId: membership?.org_id || null, platform, account, tokens });
    return back(`connected=${platform}`);
  } catch (err) {
    return back(`error=${encodeURIComponent(err.message || 'connect_failed')}`);
  }
});
