import { NextResponse } from 'next/server';
import { patchFromClarification } from '../../../../lib/services/blueprintService.js';
import { getLatest, VersionConflictError } from '../../../../lib/services/blueprintRepository.js';

function handleError(err) {
  if (err instanceof VersionConflictError || err.name === 'VersionConflictError') {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  console.error(err);
  return NextResponse.json({ error: err.message }, { status: 500 });
}

// Section 16.3 - GET latest Blueprint
export async function GET(request, { params }) {
  try {
    const bp = await getLatest(params.id);
    if (!bp) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    return NextResponse.json(bp);
  } catch (err) {
    return handleError(err);
  }
}

// Section 16.2 - PATCH Blueprint from a clarification answer
export async function PATCH(request, { params }) {
  try {
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
      newUserTurn: new_user_turn,
      changeReason: change_reason,
      sourceTurnId: source_turn_id,
    });

    return NextResponse.json({
      blueprint_id: result.blueprintId,
      version: result.version,
      status: result.status,
      blueprint: result.blueprint,
      readiness: result.readiness,
    });
  } catch (err) {
    return handleError(err);
  }
}
