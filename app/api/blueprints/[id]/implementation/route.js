import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { assertBlueprintOwner } from '@/lib/auth/ownership';
import { getImplementation, confirmImplemented, setActive, reportOutcome } from '@/lib/services/adoption/implementationRepository';

export const dynamic = 'force-dynamic';

// Implementation tracking (Phase 3).
//   GET   → current implementation record
//   POST  { platform, deployed_at, owner } → confirm implemented (3.1)
//   PATCH { active }                       → active/inactive toggle (3.2)
//   PUT   { usage_volume, time_saved_hours, notes } → outcome report (3.3)
export const GET = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);
  return NextResponse.json({ implementation: await getImplementation(params.id) });
});

export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);
  const b = await request.json().catch(() => ({}));
  const impl = await confirmImplemented({ blueprintId: params.id, userId: user.id, platform: b.platform, deployedAt: b.deployed_at, owner: b.owner });
  return NextResponse.json({ implementation: impl });
});

export const PATCH = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);
  const { active } = await request.json().catch(() => ({}));
  const impl = await setActive({ blueprintId: params.id, userId: user.id, active: !!active });
  return NextResponse.json({ implementation: impl });
});

export const PUT = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);
  const b = await request.json().catch(() => ({}));
  const impl = await reportOutcome({ blueprintId: params.id, userId: user.id, usageVolume: b.usage_volume, timeSavedHours: b.time_saved_hours, notes: b.notes, minutesSavedPerRun: b.minutes_saved_per_run });
  return NextResponse.json({ implementation: impl });
});
