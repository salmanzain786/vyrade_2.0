import { NextResponse } from 'next/server';
import { getLatest, getVersion } from '../../../../../lib/services/blueprintRepository.js';
import { buildCostComparison } from '../../../../../lib/services/cost/costComparison.js';
import { parseVolumeOverride, parseVersion } from '../../../../../lib/services/cost/costQuery.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

// GET /api/blueprints/[id]/cost?version=&monthlyRuns=
//
// Cross-platform cost comparison for a Blueprint. A cost response can reveal the
// user's systems, tools, volume and automation design, so this route is locked:
//   • withAuth              — authenticated users only (401 otherwise)
//   • assertBlueprintOwner  — the caller must OWN this Blueprint (403/404),
//                             enforced BEFORE any Blueprint data is read or any
//                             cost is computed → never another user's data.
//   • current version by default; an explicit ?version= must be a positive int
//     AND still resolves within THIS (owner-gated) Blueprint.
//   • ?monthlyRuns= override is validated (positive, bounded) and surfaced to
//     the user as an explicit assumption ("User-provided volume: N runs/month").
export const GET = withAuth(async (user, request, { params }) => {
  // Ownership gate FIRST — nothing below runs for a Blueprint the user doesn't own.
  await assertBlueprintOwner(user, params.id);

  const url = new URL(request.url);

  // (4) Validate the volume override — reject junk (negative/zero/NaN/huge)
  // rather than silently ignoring it.
  const vol = parseVolumeOverride(url.searchParams.get('monthlyRuns'));
  if (vol.error) return NextResponse.json({ error: vol.error }, { status: 400 });

  // (3) Validate an optional explicit version; default is the current version.
  const ver = parseVersion(url.searchParams.get('version'));
  if (ver.error) return NextResponse.json({ error: ver.error }, { status: 400 });

  // getVersion is scoped to THIS blueprint id (already owner-checked), so a
  // version override can never reach another Blueprint's data.
  const record = ver.value != null
    ? await getVersion(params.id, ver.value)
    : await getLatest(params.id);
  if (!record?.blueprint) {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
  }

  const comparison = await buildCostComparison({
    blueprint: record.blueprint,
    blueprintId: params.id,
    blueprintVersion: record.version,
    monthlyRuns: vol.value,
  });

  // Version context so the UI can flag a HISTORICAL estimate ("this is for v3,
  // not the latest v5") and never let an old estimate read as the current one.
  return NextResponse.json({
    ...comparison,
    blueprint_version: record.version,
    current_version: record.current_version,
    is_current: record.is_current,
    requested_version: ver.value,      // null when the caller didn't pin a version
    volume_override: vol.value,
  });
});
