import { NextResponse } from 'next/server';
import { clearSessionCookie, getCurrentUser } from '../../../../lib/auth/session.js';
import { trackServer } from '../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../lib/analytics/events.js';

export const dynamic = 'force-dynamic';

export async function POST() {
  // Resolve who is signing out BEFORE clearing the cookie, so the event is
  // attributed to the right user (the client also calls mixpanel.reset()).
  const user = await getCurrentUser().catch(() => null);
  clearSessionCookie();
  if (user) trackServer(EVENTS.LOGGED_OUT, { distinctId: user.id, email: user.email });
  return NextResponse.json({ ok: true });
}
