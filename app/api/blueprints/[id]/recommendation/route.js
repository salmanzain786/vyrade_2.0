import { NextResponse } from 'next/server';
import { getLatest, getVersion } from '../../../../../lib/services/blueprintRepository.js';
import { recommend } from '../../../../../lib/services/recommendation/recommendationEngine.js';
import { parseVolumeOverride, parseVersion } from '../../../../../lib/services/cost/costQuery.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

// GET /api/blueprints/[id]/recommendation?version=&monthlyRuns=
// The deterministic architecture recommendation (owner only). Rules-based and
// lightweight — no LLM, no doc retrieval.
export const GET = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const url = new URL(request.url);
  const vol = parseVolumeOverride(url.searchParams.get('monthlyRuns'));
  if (vol.error) return NextResponse.json({ error: vol.error }, { status: 400 });
  const ver = parseVersion(url.searchParams.get('version'));
  if (ver.error) return NextResponse.json({ error: ver.error }, { status: 400 });

  const record = ver.value != null ? await getVersion(params.id, ver.value) : await getLatest(params.id);
  if (!record?.blueprint) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });

  const recommendation = recommend({
    blueprint: record.blueprint,
    blueprintId: params.id,
    blueprintVersion: record.version,
    monthlyRuns: vol.value,
  });

  return NextResponse.json({
    ...recommendation,
    current_version: record.current_version,
    is_current: record.is_current,
  });
});
