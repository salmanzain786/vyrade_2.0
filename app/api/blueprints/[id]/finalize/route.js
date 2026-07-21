import { NextResponse } from 'next/server';
import { finalizeBlueprint } from '../../../../../lib/services/blueprintService.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';
import { trackServer } from '../../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../../lib/analytics/events.js';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const { expected_version } = await request.json();
  if (expected_version === undefined) {
    return NextResponse.json({ error: 'expected_version is required' }, { status: 400 });
  }

  const result = await finalizeBlueprint({
    blueprintId: params.id,
    expectedVersion: Number(expected_version),
  });

  trackServer(EVENTS.BLUEPRINT_FINALIZED, {
    distinctId: user.id,
    blueprint_id: params.id,
    version: result.version,
    status: result.status,
    readiness_score: result.readiness?.score ?? null,
  });
  // A distinct milestone event makes the "reached a generatable blueprint"
  // conversion trivial to chart as its own funnel step.
  if (result.status === 'requirements_complete') {
    trackServer(EVENTS.BLUEPRINT_READY, {
      distinctId: user.id,
      blueprint_id: params.id,
      version: result.version,
    });
  }

  return NextResponse.json(result);
});
