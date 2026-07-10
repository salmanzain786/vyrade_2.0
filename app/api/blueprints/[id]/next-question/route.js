import { NextResponse } from 'next/server';
import { getNextQuestion } from '../../../../../lib/services/blueprintService.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const { version, conversation_so_far } = await request.json();
  const question = await getNextQuestion({
    blueprintId: params.id,
    version: Number(version),
    conversationSoFar: conversation_so_far || '',
  });
  return NextResponse.json({ question });
});
