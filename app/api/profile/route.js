import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getProfile, upsertProfile } from '@/lib/services/adoption/profileRepository';
import { seedOpportunitiesForProfile } from '@/lib/services/adoption/opportunityRepository';

export const dynamic = 'force-dynamic';

// Progressive profile (Phase 1.1).
//   GET → the current user's profile (null if none yet)
//   PUT { …fields } → upsert (partial ok); reseeds the opportunity map
export const GET = withAuth(async (user) => {
  const profile = await getProfile(user.id).catch(() => null);
  return NextResponse.json({ profile });
});

export const PUT = withAuth(async (user, request) => {
  const patch = await request.json().catch(() => ({}));
  const profile = await upsertProfile(user.id, patch);
  // A new/changed department means new relevant areas — seed them (idempotent).
  await seedOpportunitiesForProfile(user.id, profile).catch(() => {});
  return NextResponse.json({ profile });
});
