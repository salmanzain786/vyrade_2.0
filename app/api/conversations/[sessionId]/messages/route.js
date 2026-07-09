import { NextResponse } from 'next/server';
import { addMessage } from '../../../../../lib/services/conversationRepository.js';

const ALLOWED_ROLES = new Set(['user', 'agent', 'system']);

export async function POST(request, { params }) {
  try {
    const { role, content } = await request.json();
    if (!ALLOWED_ROLES.has(role) || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Invalid role or content' }, { status: 400 });
    }
    await addMessage(params.sessionId, role, content);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
