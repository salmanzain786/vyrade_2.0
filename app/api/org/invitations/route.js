import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getMembership } from '@/lib/services/org/membershipRepository';
import { createInvitation, listInvitations, revokeInvitation } from '@/lib/services/org/invitationRepository';
import { canInvite } from '@/lib/services/org/access';

export const dynamic = 'force-dynamic';

async function requireInviter(user) {
  const m = await getMembership(user.id).catch(() => null);
  if (!m || !canInvite(m.role)) return null;
  return m;
}

// Org invitations (Phase 2.2). Owner/admin only.
//   GET → pending invites · POST { email, role, department } → create
//   DELETE ?id= → revoke
export const GET = withAuth(async (user) => {
  const m = await requireInviter(user);
  if (!m) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  return NextResponse.json({ invitations: await listInvitations(m.org_id) });
});

export const POST = withAuth(async (user, request) => {
  const m = await requireInviter(user);
  if (!m) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  const { email, role = 'member', department = null } = await request.json().catch(() => ({}));
  try {
    const inv = await createInvitation({ orgId: m.org_id, email, role, department, invitedBy: user.id });
    const base = new URL(request.url).origin;
    return NextResponse.json({ invitation: inv, accept_url: `${base}/org/join?token=${inv.token}` }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
});

export const DELETE = withAuth(async (user, request) => {
  const m = await requireInviter(user);
  if (!m) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  await revokeInvitation({ orgId: m.org_id, id });
  return NextResponse.json({ ok: true });
});
