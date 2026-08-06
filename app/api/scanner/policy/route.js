import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { assertBlueprintOwner } from '@/lib/auth/ownership';
import { getPolicy, savePolicy, getScanContextForBlueprint } from '@/lib/services/scanner/scanRepository';
import { deriveDefaultPolicy } from '@/lib/services/scanner/policy';

export const dynamic = 'force-dynamic';

// Governance & Policy Requirements (Phase 6.1).
//   GET  ?blueprintId=…   → the authored policy, or a derived (disabled) default
//   PUT  { blueprintId, policy } → save the authored policy
export const GET = withAuth(async (user, request) => {
  const blueprintId = new URL(request.url).searchParams.get('blueprintId');
  if (!blueprintId) return NextResponse.json({ error: 'blueprintId is required' }, { status: 400 });
  await assertBlueprintOwner(user, blueprintId);

  const existing = await getPolicy(blueprintId).catch(() => null);
  if (existing) return NextResponse.json({ defined: true, ...existing });

  // No authored policy yet → offer a default seeded from the Blueprint.
  const ctx = await getScanContextForBlueprint(blueprintId).catch(() => null);
  if (!ctx) return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
  return NextResponse.json({ defined: false, policy: deriveDefaultPolicy(ctx.blueprint || {}), enabled: false });
});

export const PUT = withAuth(async (user, request) => {
  const body = await request.json().catch(() => ({}));
  if (!body.blueprintId) return NextResponse.json({ error: 'blueprintId is required' }, { status: 400 });
  await assertBlueprintOwner(user, body.blueprintId);
  const policy = await savePolicy({ blueprintId: body.blueprintId, policy: body.policy || {}, userId: user.id });
  return NextResponse.json({ defined: true, policy, enabled: policy.enabled });
});
