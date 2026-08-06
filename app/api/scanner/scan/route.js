import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { assertBlueprintOwner } from '@/lib/auth/ownership';
import { scanWorkflow, scanContext, SUPPORTED_PLATFORMS } from '@/lib/services/scanner/scan';
import { getScanContextForBlueprint, saveScan, getLatestScan } from '@/lib/services/scanner/scanRepository';

export const dynamic = 'force-dynamic';

// Governance & Compliance Scanner endpoint.
//   POST { workflow, platform? }            → security + privacy (Phases 1–2)
//   POST { blueprintId }                    → full scan incl. operational
//                                             controls (Phase 3), by blueprint
export const POST = withAuth(async (user, request) => {
  const body = await request.json().catch(() => ({}));

  // ── Blueprint-scoped full scan (Phases 1–3), persisted for history ──
  if (body.blueprintId) {
    await assertBlueprintOwner(user, body.blueprintId);
    const ctx = await getScanContextForBlueprint(body.blueprintId).catch(() => null);
    if (!ctx) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });

    try {
      // Capture the prior scan BEFORE inserting the new one, for before/after.
      const previous = await getLatestScan(body.blueprintId).catch(() => null);
      const result = scanContext(ctx);
      const scanId = await saveScan({ blueprintId: body.blueprintId, userId: user.id, ctx, result });
      const prev = previous && { readiness_pct: previous.readiness_pct, security_risk_level: previous.security_risk_level, findings_total: previous.findings_total, scanned_at: previous.created_at };
      return NextResponse.json({
        ...result,
        scan_id: scanId,
        scanned_at: new Date().toISOString(),
        previous: prev || null,
        readiness_delta: prev ? result.report.overall.governance_readiness_pct - prev.readiness_pct : null,
        ...(ctx.workflow ? {} : { note: 'No generated workflow for this Blueprint — operational-controls (Phase 3) only.' }),
      });
    } catch (err) {
      return NextResponse.json({ error: `Scan failed: ${err.message}` }, { status: 422 });
    }
  }

  // ── Standalone workflow scan (Phases 1–2) ──
  const { workflow, platform = 'n8n' } = body;
  if (!workflow || typeof workflow !== 'object') {
    return NextResponse.json({ error: 'A `workflow` object or a `blueprintId` is required.' }, { status: 400 });
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
