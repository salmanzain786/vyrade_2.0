import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { assertBlueprintOwner } from '@/lib/auth/ownership';
import { getScanContextForBlueprint, getLatestScan, saveScan } from '@/lib/services/scanner/scanRepository';
import { scanContext } from '@/lib/services/scanner/scan';
import { buildRemediationBrief, remediationPromptBlock } from '@/lib/services/scanner/remediation';
import { diffScans } from '@/lib/services/scanner/reassessment';
import { generateWorkflow } from '@/lib/services/blueprintService';

export const dynamic = 'force-dynamic';

// Remediation Loop (Phase 7.1 + 7.3).
//   POST { blueprintId }
// Regenerates the workflow via Vyrade's existing generator, SEEDED with the last
// scan's findings, then re-scans the result and returns before/after — proving
// the loop closed, not just that a recommendation was made.
export const POST = withAuth(async (user, request) => {
  const { blueprintId } = await request.json().catch(() => ({}));
  if (!blueprintId) return NextResponse.json({ error: 'blueprintId is required' }, { status: 400 });
  await assertBlueprintOwner(user, blueprintId);

  const ctx = await getScanContextForBlueprint(blueprintId).catch(() => null);
  if (!ctx) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
  if (ctx.currentVersion == null) return NextResponse.json({ error: 'Blueprint has no current version' }, { status: 422 });

  // BEFORE — the latest persisted scan (compute a baseline if none exists yet).
  let before = await getLatestScan(blueprintId).catch(() => null);
  if (!before?.report) {
    const baseline = scanContext(ctx);
    await saveScan({ blueprintId, userId: user.id, ctx, result: baseline });
    before = await getLatestScan(blueprintId).catch(() => null);
  }

  // 7.1 — build the remediation brief from the before-scan findings.
  const brief = buildRemediationBrief({ findings: before?.findings || [], policy: ctx.policy });
  const block = remediationPromptBlock(brief);
  if (!block) {
    return NextResponse.json({ error: 'No regeneration-addressable findings — nothing a rebuild can fix. (Remaining items are advisory / process controls.)', brief }, { status: 400 });
  }

  // 7.1 — regenerate, seeded with the findings (reuses the existing generator).
  try {
    await generateWorkflow({ blueprintId, version: ctx.currentVersion, remediationBlock: block });
  } catch (err) {
    return NextResponse.json({ error: `Regeneration failed: ${err.message}` }, { status: 422 });
  }

  // 7.3 — reassess against the NEW workflow and persist the after-scan.
  const newCtx = await getScanContextForBlueprint(blueprintId);
  const afterResult = scanContext(newCtx);
  const scanId = await saveScan({ blueprintId, userId: user.id, ctx: newCtx, result: afterResult });
  const after = {
    readiness_pct: afterResult.report.overall.governance_readiness_pct,
    security_risk_level: afterResult.report.overall.security_risk_level,
    findings: afterResult.findings,
  };

  const diff = diffScans({ current: after, previous: before });
  return NextResponse.json({
    ok: true,
    scan_id: scanId,
    brief: { directives: brief.directives, addressable_types: brief.addressable_types, advisory: brief.advisory },
    before: { readiness_pct: before.readiness_pct, security_risk_level: before.security_risk_level },
    after: { readiness_pct: after.readiness_pct, security_risk_level: after.security_risk_level },
    diff: { counts: diff.counts, readiness_delta: diff.readiness_delta, improved: diff.improved },
  });
});
