import { NextResponse } from 'next/server';
import { getMessages } from '../../../../lib/services/conversationRepository.js';
import { getBySession, getLatestWorkflow } from '../../../../lib/services/blueprintRepository.js';
import { withAuth } from '../../../../lib/auth/guard.js';
import { assertSessionAccess } from '../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

// Load one conversation: its full message history, the latest Blueprint for the
// session, and any previously generated workflow (so the sheet, generate, and
// download buttons all restore on reopen). Scoped to the owning user — a
// brand-new/unknown session simply returns empties.
export const GET = withAuth(async (user, request, { params }) => {
  const { exists } = await assertSessionAccess(user, params.sessionId);
  if (!exists) {
    return NextResponse.json({ messages: [], blueprint: null, workflow: null });
  }

  const [messages, blueprint] = await Promise.all([
    getMessages(params.sessionId),
    getBySession(params.sessionId),
  ]);
  const workflow = blueprint ? await getLatestWorkflow(blueprint.blueprint_id) : null;
  return NextResponse.json({ messages, blueprint, workflow });
});
