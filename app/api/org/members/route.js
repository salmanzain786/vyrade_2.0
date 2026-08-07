import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getMembership, listMembers, updateMember, removeMember } from '@/lib/services/org/membershipRepository';
import { canManageMembers } from '@/lib/services/org/access';
import { resolveScope } from '@/lib/services/org/access';

export const dynamic = 'force-dynamic';

// Org members (Phase 2.2).
//   GET → members visible to the caller (managers see their department only)
//   PATCH { userId, role?, department? } → owner/admin only
//   DELETE ?userId= → owner/admin only (cannot remove the owner)
export const GET = withAuth(async (user) => {
  const m = await getMembership(user.id).catch(() => null);
  if (!m) return NextResponse.json({ error: 'Not in an organisation' }, { status: 404 });
  const { departmentFilter } = resolveScope(m);
  return NextResponse.json({ members: await listMembers(m.org_id, { department: departmentFilter }) });
});

export const PATCH = withAuth(async (user, request) => {
  const m = await getMembership(user.id).catch(() => null);
  if (!m || !canManageMembers(m.role)) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  const { userId, role, department } = await request.json().catch(() => ({}));
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  try {
    await updateMember({ orgId: m.org_id, userId, role, department });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
});

export const DELETE = withAuth(async (user, request) => {
  const m = await getMembership(user.id).catch(() => null);
  if (!m || !canManageMembers(m.role)) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  await removeMember({ orgId: m.org_id, userId });
  return NextResponse.json({ ok: true });
});
