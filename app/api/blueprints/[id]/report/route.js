import { NextResponse } from 'next/server';
import { getLatest, getVersion } from '../../../../../lib/services/blueprintRepository.js';
import { generateBlueprintReport } from '../../../../../lib/services/report/blueprintReport.js';
import { parseVolumeOverride, parseVersion } from '../../../../../lib/services/cost/costQuery.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

// GET /api/blueprints/[id]/report?version=&monthlyRuns=
// The customer-facing Automation Blueprint report (owner only). Assembles the
// Blueprint, recommendation, cost comparison and tool intelligence into one
// structured deliverable.
export const GET = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const url = new URL(request.url);
  const vol = parseVolumeOverride(url.searchParams.get('monthlyRuns'));
  if (vol.error) return NextResponse.json({ error: vol.error }, { status: 400 });
  const ver = parseVersion(url.searchParams.get('version'));
  if (ver.error) return NextResponse.json({ error: ver.error }, { status: 400 });

  const record = ver.value != null ? await getVersion(params.id, ver.value) : await getLatest(params.id);
  if (!record?.blueprint) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });

  const report = await generateBlueprintReport({
    blueprint: record.blueprint,
    blueprintId: params.id,
    blueprintVersion: record.version,
    monthlyRuns: vol.value,
  });

  return NextResponse.json({
    ...report,
    current_version: record.current_version,
    is_current: record.is_current,
  });
});
