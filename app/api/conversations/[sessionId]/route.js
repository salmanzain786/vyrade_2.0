import { NextResponse } from 'next/server';
import { getMessages } from '../../../../lib/services/conversationRepository.js';
import { getBySession, getLatestWorkflow } from '../../../../lib/services/blueprintRepository.js';

// Load one conversation: its full message history, the latest Blueprint for the
// session, and any previously generated workflow (so the sheet, generate, and
// download buttons all restore on reopen).
export async function GET(request, { params }) {
  try {
    const [messages, blueprint] = await Promise.all([
      getMessages(params.sessionId),
      getBySession(params.sessionId),
    ]);
    const workflow = blueprint ? await getLatestWorkflow(blueprint.blueprint_id) : null;
    return NextResponse.json({ messages, blueprint, workflow });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
