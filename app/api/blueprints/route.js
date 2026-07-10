import { NextResponse } from 'next/server';
import { createInitialBlueprint } from '../../../lib/services/blueprintService.js';
import { withAuth } from '../../../lib/auth/guard.js';
import { assertSessionAccess } from '../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (user, request) => {
  const { session_id, conversation_text, source_turn_id } = await request.json();
  if (!session_id || !conversation_text) {
    return NextResponse.json(
      { error: 'session_id and conversation_text are required' },
      { status: 400 }
    );
  }

  // A blueprint is always created against a session the user owns (or a fresh
  // one). Ownership on the blueprint row itself gates every later mutation.
  await assertSessionAccess(user, session_id);

  const result = await createInitialBlueprint({
    sessionId: session_id,
    userId: user.id,
    conversationText: conversation_text,
    sourceTurnId: source_turn_id,
  });

  return NextResponse.json(
    {
      blueprint_id: result.blueprintId,
      version: result.version,
      status: result.status,
      blueprint: result.blueprint,
      readiness: result.readiness,
    },
    { status: 201 }
  );
});
