import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { assertBlueprintOwner } from '@/lib/auth/ownership';
import { scanWorkflow, SUPPORTED_PLATFORMS } from '@/lib/services/scanner/scan';
import { assessOperationalControls } from '@/lib/services/scanner/operationalControls';
import { getScanContextForBlueprint } from '@/lib/services/scanner/scanRepository';
import { mapFrameworks } from '@/lib/services/scanner/frameworks';
import { generateAssessmentReport } from '@/lib/services/scanner/report';
import { summarize, rankFindings } from '@/lib/services/scanner/model';

export const dynamic = 'force-dynamic';

// Governance & Compliance Scanner endpoint.
//   POST { workflow, platform? }            → security + privacy (Phases 1–2)
//   POST { blueprintId }                    → full scan incl. operational
//                                             controls (Phase 3), by blueprint
export const POST = withAuth(async (user, request) => {
  const body = await request.json().catch(() => ({}));

  // ── Blueprint-scoped full scan (Phases 1–3) ──
  if (body.blueprintId) {
    await assertBlueprintOwner(user, body.blueprintId);
    const ctx = await getScanContextForBlueprint(body.blueprintId).catch(() => null);
    if (!ctx) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });

    // No generated workflow yet → still assess Blueprint operational controls.
    if (!ctx.workflow) {
      const findings = rankFindings(assessOperationalControls(ctx));
      const framework_mapping = mapFrameworks(findings);
      return NextResponse.json({
        platform: ctx.platform, workflow_name: null, node_count: 0,
        scanned_at: new Date().toISOString(), findings, summary: summarize(findings),
        framework_mapping,
        report: generateAssessmentReport({ findings, framework_mapping, platform: ctx.platform, node_count: 0, blueprintAssessed: true }),
        note: 'No generated workflow for this Blueprint — operational-controls (Phase 3) only.',
      });
    }
    try {
      const result = scanWorkflow(ctx);
      return NextResponse.json({ ...result, scanned_at: new Date().toISOString() });
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
