import { NextResponse } from 'next/server';
import { getLatest, getVersion } from '../../../../../lib/services/blueprintRepository.js';
import { buildCostComparison } from '../../../../../lib/services/cost/costComparison.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

// GET /api/blueprints/[id]/cost?version=&monthlyRuns=
// Cross-platform cost comparison for a Blueprint (owner only). Prices come from
// the pricing_sources / connector_cost_profiles registries; anything unpriced is
// reported as unknown, never guessed.
export const GET = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const url = new URL(request.url);
  const versionParam = url.searchParams.get('version');
  const runsParam = url.searchParams.get('monthlyRuns');

  const record = versionParam
    ? await getVersion(params.id, Number(versionParam))
    : await getLatest(params.id);
  if (!record?.blueprint) {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
  }

  const monthlyRuns = runsParam && Number.isFinite(Number(runsParam)) ? Number(runsParam) : null;

  const comparison = await buildCostComparison({
    blueprint: record.blueprint,
    blueprintId: params.id,
    blueprintVersion: record.version,
    monthlyRuns,
  });

  return NextResponse.json(comparison);
});
