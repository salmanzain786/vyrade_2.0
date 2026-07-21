import { NextResponse } from 'next/server';
import { generateWorkflow } from '../../../../../lib/services/blueprintService.js';
import { getBlueprintSessionId } from '../../../../../lib/services/blueprintRepository.js';
import { addMessage } from '../../../../../lib/services/conversationRepository.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';
import { costForUsage } from '../../../../../lib/config/pricing.js';
import { trackServer } from '../../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../../lib/analytics/events.js';

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

  // Authoritative, ad-blocker-proof business event with the detail the client
  // can't see: node count, real-import result, tokens and computed cost.
  const cost = costForUsage(usage);
  trackServer(EVENTS.WORKFLOW_GENERATED, {
    distinctId: user.id,
    blueprint_id: params.id,
    session_id: sessionId || undefined,
    version: Number(version),
    node_count: workflow?.nodes?.length ?? null,
    import_check: workflow?.meta?.import_check ?? null,
    repair_attempts: workflow?.meta?.repair_attempts ?? null,
    prompt_tokens: usage?.promptTokens ?? null,
    completion_tokens: usage?.completionTokens ?? null,
    total_tokens: usage?.totalTokens ?? null,
    cost_usd: cost,
    model: usage?.model ?? null,
  });
  trackServer(EVENTS.LLM_USAGE, {
    distinctId: user.id,
    operation: 'generate_workflow',
    blueprint_id: params.id,
    total_tokens: usage?.totalTokens ?? null,
    cost_usd: cost,
    model: usage?.model ?? null,
  });

  return NextResponse.json({ workflow, usage });
});
