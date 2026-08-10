import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guard';
import { getActiveConnection } from '@/lib/services/work-intelligence/connectionRepository';
import { getOptoutSet, addOptout, removeOptout, listOptouts } from '@/lib/services/work-intelligence/optouts';

export const dynamic = 'force-dynamic';

// Employee opt-outs (Phase 1.4). Identities are hashed on write; only hashes are
// ever returned.
//   GET → hashed opt-out list · POST { employee } → add · DELETE ?ref= → remove
async function conn(user, platform) { return getActiveConnection(user.id, platform).catch(() => null); }

export const GET = withAuth(async (user, request, { params }) => {
  const c = await conn(user, params.platform);
  if (!c) return NextResponse.json({ error: 'No active connection' }, { status: 404 });
  return NextResponse.json({ optouts: await listOptouts(c.id) });
});

export const POST = withAuth(async (user, request, { params }) => {
  const c = await conn(user, params.platform);
  if (!c) return NextResponse.json({ error: 'No active connection' }, { status: 404 });
  const { employee } = await request.json().catch(() => ({}));
  if (!employee) return NextResponse.json({ error: 'employee (email/id) is required' }, { status: 400 });
  const added = await addOptout({ connectionId: c.id, employee });
  return NextResponse.json({ ok: true, employee_ref: added.employee_ref });
});

export const DELETE = withAuth(async (user, request, { params }) => {
  const c = await conn(user, params.platform);
  if (!c) return NextResponse.json({ error: 'No active connection' }, { status: 404 });
  const ref = new URL(request.url).searchParams.get('ref');
  if (!ref) return NextResponse.json({ error: 'ref is required' }, { status: 400 });
  await removeOptout({ connectionId: c.id, employeeRef: ref });
  return NextResponse.json({ ok: true });
});
