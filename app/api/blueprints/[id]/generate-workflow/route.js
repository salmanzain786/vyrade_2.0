import { NextResponse } from 'next/server';
import { generateWorkflow } from '../../../../../lib/services/blueprintService.js';
import { getBlueprintSessionId } from '../../../../../lib/services/blueprintRepository.js';
import { addMessage } from '../../../../../lib/services/conversationRepository.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';
import { costForUsage } from '../../../../../lib/config/pricing.js';
import { trackServer } from '../../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../../lib/analytics/events.js';
import { recordEvent } from '../../../../../lib/services/insights/operationalInsightsRepository.js';
import { OPS_EVENTS, errorCategoryFromN8n, parseFailingNode } from '../../../../../lib/services/insights/operationalInsights.js';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const { version } = await request.json();
  let workflow, usage;
  try {
    ({ workflow, usage } = await generateWorkflow({ blueprintId: params.id, version: Number(version) }));
  } catch (err) {
    // Operational Insights: capture generation failures (category only, no PII).
    recordEvent({
      eventType: OPS_EVENTS.GENERATION_FAILED, platform: 'n8n',
      blueprintId: params.id, userId: user.id, severity: 'error',
      errorCategory: errorCategoryFromN8n(err?.message),
    });
    throw err;
  }

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
    userId: user.id,
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
    userId: user.id,
    operation: 'generate_workflow',
    blueprint_id: params.id,
    total_tokens: usage?.totalTokens ?? null,
    cost_usd: cost,
    model: usage?.model ?? null,
  });

  // ── Operational Insights (Task E): the learning-loop signals ──
  const importCheck = workflow?.meta?.import_check ?? 'skipped';
  const repairAttempts = workflow?.meta?.repair_attempts ?? 0;
  const nodeCount = workflow?.nodes?.length ?? null;
  recordEvent({
    eventType: OPS_EVENTS.WORKFLOW_GENERATED, platform: 'n8n',
    blueprintId: params.id, userId: user.id,
    tokens: usage?.totalTokens ?? null, costUsd: cost, metric: nodeCount,
    metadata: { import_check: importCheck, repair_attempts: repairAttempts, model: usage?.model },
  });
  if (repairAttempts > 0) {
    recordEvent({ eventType: OPS_EVENTS.REPAIR_PERFORMED, platform: 'n8n', blueprintId: params.id, userId: user.id, metric: repairAttempts, severity: 'warning' });
  }
  if (importCheck === 'failed') {
    // Which node broke import, and why (category) — the top-failing-nodes signal.
    recordEvent({
      eventType: OPS_EVENTS.IMPORT_FAILED, platform: 'n8n', blueprintId: params.id, userId: user.id,
      severity: 'error',
      nodeType: parseFailingNode(workflow?.meta?.import_error, workflow?.nodes),
      errorCategory: errorCategoryFromN8n(workflow?.meta?.import_error),
    });
  } else if (importCheck === 'skipped') {
    recordEvent({ eventType: OPS_EVENTS.IMPORT_SKIPPED, platform: 'n8n', blueprintId: params.id, userId: user.id });
  }

  return NextResponse.json({ workflow, usage });
});
