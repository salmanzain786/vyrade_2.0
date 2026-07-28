import { NextResponse } from 'next/server';
import { getLatest, getVersion } from '../../../../../lib/services/blueprintRepository.js';
import { recommend } from '../../../../../lib/services/recommendation/recommendationEngine.js';
import { saveRecommendation, getLatestRecommendation } from '../../../../../lib/services/recommendation/recommendationRepository.js';
import { parseVolumeOverride, parseVersion } from '../../../../../lib/services/cost/costQuery.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

const DRAFT_WARNING = 'Blueprint is not complete yet — this is a draft recommendation and may change as requirements are finalized.';
const nrun = (x) => (x == null ? null : Number(x));

// Resolve the target Blueprint record + validate the shared query params.
// Returns { record, isComplete, runs } or { error, status }.
async function resolve(params, { version, monthlyRuns }) {
  const vol = parseVolumeOverride(monthlyRuns);
  if (vol.error) return { error: vol.error, status: 400 };
  const ver = parseVersion(version);
  if (ver.error) return { error: ver.error, status: 400 };

  const record = ver.value != null ? await getVersion(params.id, ver.value) : await getLatest(params.id);
  if (!record?.blueprint) return { error: 'Blueprint not found', status: 404 };

  return {
    record,
    runs: vol.value,
    isComplete: (record.status ?? record.readiness?.status) === 'requirements_complete',
  };
}

// GET — READ ONLY. Returns the latest PERSISTED recommendation for this exact
// input, or a fresh non-persisted preview. A GET never writes to the database
// (safe for reloads, prefetch, crawlers, retries).
export const GET = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);
  const url = new URL(request.url);
  const r = await resolve(params, { version: url.searchParams.get('version'), monthlyRuns: url.searchParams.get('monthlyRuns') });
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });

  const { record, runs, isComplete } = r;
  const meta = { current_version: record.current_version, is_current: record.is_current, mode: isComplete ? 'final' : 'draft_recommendation', warning: isComplete ? null : DRAFT_WARNING };

  // Prefer the latest persisted run when it matches the requested input.
  const saved = await getLatestRecommendation(params.id, record.version).catch(() => null);
  if (saved && nrun(saved.monthly_runs) === nrun(runs)) {
    return NextResponse.json({ ...saved.recommendation, generated_at: saved.generated_at, recommendation_id: saved.id, persisted: true, ...meta });
  }

  // Otherwise a non-persisted preview (persist it with POST or by building).
  const recommendation = recommend({ blueprint: record.blueprint, blueprintId: params.id, blueprintVersion: record.version, monthlyRuns: runs });
  return NextResponse.json({ ...recommendation, recommendation_id: null, persisted: false, ...meta });
});

// POST — PERSIST a final recommendation. Requires a complete Blueprint. The
// underlying save is an idempotent insert-if-changed on
// (blueprint_id, blueprint_version, engine_version, monthly_runs).
export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);
  const body = await request.json().catch(() => ({}));
  const r = await resolve(params, {
    version: body.version != null ? String(body.version) : null,
    monthlyRuns: body.monthlyRuns != null ? String(body.monthlyRuns) : null,
  });
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });

  const { record, runs, isComplete } = r;
  if (!isComplete) {
    return NextResponse.json(
      { error: 'Blueprint must be complete (requirements_complete) before a recommendation can be finalized.' },
      { status: 409 }
    );
  }

  const recommendation = recommend({ blueprint: record.blueprint, blueprintId: params.id, blueprintVersion: record.version, monthlyRuns: runs });
  let saved = null;
  try {
    saved = await saveRecommendation({
      blueprintId: params.id, blueprintVersion: record.version, userId: user.id,
      recommendation, monthlyRuns: runs, generatedAt: new Date(),
    });
    recommendation.generated_at = saved.generated_at;
  } catch (err) {
    console.error('[recommendation] persistence failed:', err.message);
  }

  return NextResponse.json({
    ...recommendation,
    recommendation_id: saved?.id ?? null,
    persisted: !!saved,
    stored_new: saved?.stored ?? false,
    mode: 'final',
    current_version: record.current_version,
    is_current: record.is_current,
  });
});
