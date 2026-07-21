import { NextResponse } from 'next/server';
import { patchFromClarification } from '../../../../lib/services/blueprintService.js';
import { getLatest } from '../../../../lib/services/blueprintRepository.js';
import { withAuth } from '../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../lib/auth/ownership.js';
import { redactForLlm } from '../../../../lib/security/redact.js';
import { trackServer } from '../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../lib/analytics/events.js';

export const dynamic = 'force-dynamic';

// Section 16.3 - GET latest Blueprint (owner only)
export const GET = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);
  const bp = await getLatest(params.id);
  if (!bp) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
  return NextResponse.json(bp);
});

// Section 16.2 - PATCH Blueprint from a clarification answer (owner only)
export const PATCH = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const { expected_version, new_user_turn, change_reason, source_turn_id } = await request.json();
  if (expected_version === undefined || !new_user_turn) {
    return NextResponse.json(
      { error: 'expected_version and new_user_turn are required' },
      { status: 400 }
    );
  }

  const result = await patchFromClarification({
    blueprintId: params.id,
    expectedVersion: Number(expected_version),
    // Strip pasted credentials before this answer reaches the model.
    newUserTurn: redactForLlm(new_user_turn, 'blueprint.patch'),
    changeReason: change_reason,
    sourceTurnId: source_turn_id,
  });

  trackServer(EVENTS.BLUEPRINT_UPDATED, {
    distinctId: user.id,
    blueprint_id: result.blueprintId,
    version: result.version,
    status: result.status,
    readiness_score: result.readiness?.score ?? null,
  });

  return NextResponse.json({
    blueprint_id: result.blueprintId,
    version: result.version,
    status: result.status,
    blueprint: result.blueprint,
    readiness: result.readiness,
    usage: result.usage, // forwarded to the next-question call for cost accounting
  });
});
