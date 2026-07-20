import { NextResponse } from 'next/server';
import { addMessage } from '../../../../../lib/services/conversationRepository.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertSessionAccess } from '../../../../../lib/auth/ownership.js';
import { redactForLlm } from '../../../../../lib/security/redact.js';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['user', 'agent', 'system']);

export const POST = withAuth(async (user, request, { params }) => {
  const { role, content } = await request.json();
  if (!ALLOWED_ROLES.has(role) || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Invalid role or content' }, { status: 400 });
  }

  // Reject appends to a chat owned by someone else; new sessions are claimed
  // for this user on first insert.
  await assertSessionAccess(user, params.sessionId);
  // Redact before persisting — a pasted credential must never be stored at rest.
  await addMessage(params.sessionId, role, redactForLlm(content, 'message.persist'), user.id);
  return NextResponse.json({ ok: true });
});
