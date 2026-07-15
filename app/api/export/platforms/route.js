import { NextResponse } from 'next/server';
import { EXPORT_PLATFORMS, READINESS_LABEL } from '../../../../lib/exporters/registry.js';
import { platformReadiness } from '../../../../lib/services/exportService.js';
import { withAuth } from '../../../../lib/auth/guard.js';

export const dynamic = 'force-dynamic';

// Readiness per export platform, so the UI can label each target
// (Full export / Guide only / Coming soon).
export const GET = withAuth(async () => {
  const readiness = platformReadiness();
  const platforms = Object.values(EXPORT_PLATFORMS).map((p) => ({
    key: p.key,
    name: p.name,
    kind: p.kind,
    readiness: readiness[p.key],
    readinessLabel: READINESS_LABEL[readiness[p.key]],
  }));
  return NextResponse.json({ platforms, readiness });
});
