import { NextResponse } from 'next/server';
import { getVersion } from '../../../../../../lib/services/blueprintRepository.js';
import { withAuth } from '../../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);
  const bp = await getVersion(params.id, Number(params.version));
  if (!bp) return NextResponse.json({ error: 'Blueprint version not found' }, { status: 404 });
  return NextResponse.json(bp);
});
