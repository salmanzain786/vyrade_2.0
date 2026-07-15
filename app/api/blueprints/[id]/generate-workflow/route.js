import { NextResponse } from 'next/server';
import { generateWorkflow } from '../../../../../lib/services/blueprintService.js';
import { getBlueprintSessionId } from '../../../../../lib/services/blueprintRepository.js';
import { addMessage } from '../../../../../lib/services/conversationRepository.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const { version } = await request.json();
  const { workflow, usage } = await generateWorkflow({
    blueprintId: params.id,
    version: Number(version),
  });

  // Record the (usually large) n8n-generation cost as a system message, which
  // also rolls it into the conversation's running total.
  const sessionId = await getBlueprintSessionId(params.id);
  if (sessionId) {
    await addMessage(sessionId, 'system', 'Generated n8n workflow.', user.id, usage);
  }

  return NextResponse.json({ workflow, usage });
});
