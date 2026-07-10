import { NextResponse } from 'next/server';
import { finalizeBlueprint } from '../../../../../lib/services/blueprintService.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';

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

  return NextResponse.json(result);
});
