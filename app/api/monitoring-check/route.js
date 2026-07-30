import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';

// Server-layer verification endpoint (milestone 1.7). Wrapped in withAuth so it
// exercises the real capture path — captureRouteError stamps route + method +
// the signed-in user's id and reports to Sentry, with NO request body/PII — and
// so it can't be hit anonymously. Gated: 404 in production unless
// MONITORING_CHECK_ENABLED=1.
export const dynamic = 'force-dynamic';

const ENABLED = process.env.NODE_ENV !== 'production' || process.env.MONITORING_CHECK_ENABLED === '1';

class MonitoringCheckError extends Error {
  constructor() {
    super('[monitoring-check] deliberate server test error — no PII');
    this.name = 'MonitoringCheckError';
  }
}

export const GET = withAuth(async () => {
  if (!ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Thrown → withAuth's catch reports it via captureRouteError, then returns 500.
  throw new MonitoringCheckError();
});
