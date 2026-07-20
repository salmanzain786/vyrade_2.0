import { NextResponse } from 'next/server';
import { getNextQuestion } from '../../../../../lib/services/blueprintService.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';
import { redactForLlm } from '../../../../../lib/security/redact.js';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const { version, conversation_so_far } = await request.json();
  const result = await getNextQuestion({
    blueprintId: params.id,
    version: Number(version),
    conversationSoFar: redactForLlm(conversation_so_far || '', 'next-question'),
  });
  return NextResponse.json({ question: result.text, done: result.done, usage: result.usage });
});
