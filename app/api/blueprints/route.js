import { NextResponse } from 'next/server';
import { createInitialBlueprint } from '../../../lib/services/blueprintService.js';

export async function POST(request) {
  try {
    const { session_id, conversation_text, source_turn_id } = await request.json();
    if (!session_id || !conversation_text) {
      return NextResponse.json(
        { error: 'session_id and conversation_text are required' },
        { status: 400 }
      );
    }

    const result = await createInitialBlueprint({
      sessionId: session_id,
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
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
