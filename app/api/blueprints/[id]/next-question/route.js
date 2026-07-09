import { NextResponse } from 'next/server';
import { getNextQuestion } from '../../../../../lib/services/blueprintService.js';

export async function POST(request, { params }) {
  try {
    const { version, conversation_so_far } = await request.json();
    const question = await getNextQuestion({
      blueprintId: params.id,
      version: Number(version),
      conversationSoFar: conversation_so_far || '',
    });
    return NextResponse.json({ question });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
