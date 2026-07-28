import { NextResponse } from 'next/server';
import { getLatest, getVersion } from '../../../../../lib/services/blueprintRepository.js';
import { recommend } from '../../../../../lib/services/recommendation/recommendationEngine.js';
import { saveRecommendation } from '../../../../../lib/services/recommendation/recommendationRepository.js';
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

  // A FINAL recommendation requires a complete Blueprint. On an incomplete one
  // we still return a DRAFT (useful early signal) but flag it clearly and do
  // NOT persist it — only final recommendations enter the audit log.
  const isComplete = (record.status ?? record.readiness?.status) === 'requirements_complete';

  let saved = null;
  if (isComplete) {
    // Persist with timestamp + input version (Task 3 DoD). Never let a storage
    // hiccup break the response.
    try {
      saved = await saveRecommendation({
        blueprintId: params.id,
        blueprintVersion: record.version,
        userId: user.id,
        recommendation,
        monthlyRuns: vol.value,
        generatedAt: new Date(),
      });
      recommendation.generated_at = saved.generated_at; // stamp what was stored
    } catch (err) {
      console.error('[recommendation] persistence failed:', err.message);
    }
  }

  return NextResponse.json({
    ...recommendation,
    mode: isComplete ? 'final' : 'draft_recommendation',
    warning: isComplete
      ? null
      : 'Blueprint is not complete yet — this is a draft recommendation and may change as requirements are finalized.',
    recommendation_id: saved?.id ?? null,   // exports can reference which run they followed
    current_version: record.current_version,
    is_current: record.is_current,
  });
});
