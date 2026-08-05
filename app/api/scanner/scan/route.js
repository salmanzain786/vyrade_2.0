import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { scanWorkflow, SUPPORTED_PLATFORMS } from '@/lib/services/scanner/scan';

export const dynamic = 'force-dynamic';

// Governance & Compliance Scanner — Phase 1 endpoint.
// POST { workflow: <n8n workflow JSON>, platform?: 'n8n' } → findings + summary.
export const POST = withAuth(async (_user, request) => {
  const body = await request.json().catch(() => ({}));
  const { workflow, platform = 'n8n' } = body;

  if (!workflow || typeof workflow !== 'object') {
    return NextResponse.json({ error: 'A `workflow` object is required.' }, { status: 400 });
  }
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: `Unsupported platform. Supported: ${SUPPORTED_PLATFORMS.join(', ')}.` }, { status: 400 });
  }

  try {
    const result = scanWorkflow({ workflow, platform });
    return NextResponse.json({ ...result, scanned_at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: `Scan failed: ${err.message}` }, { status: 422 });
  }
});
