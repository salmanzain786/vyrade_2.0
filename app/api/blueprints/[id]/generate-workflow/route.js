import { NextResponse } from 'next/server';
import { generateWorkflow } from '../../../../../lib/services/blueprintService.js';
import { getBlueprintSessionId, getVersion } from '../../../../../lib/services/blueprintRepository.js';
import { ensureRecommendation } from '../../../../../lib/services/recommendation/recommendationRepository.js';
import { recordExportRun } from '../../../../../lib/services/recommendation/exportRunRepository.js';
import { isStrictRecommendationEnforced } from '../../../../../lib/services/recommendation/enforcement.js';
import { addMessage } from '../../../../../lib/services/conversationRepository.js';
import { withAuth } from '../../../../../lib/auth/guard.js';
import { assertBlueprintOwner } from '../../../../../lib/auth/ownership.js';
import { costForUsage } from '../../../../../lib/config/pricing.js';
import { trackServer } from '../../../../../lib/analytics/server.js';
import { EVENTS } from '../../../../../lib/analytics/events.js';
import { recordEvent } from '../../../../../lib/services/insights/operationalInsightsRepository.js';
import { OPS_EVENTS, errorCategoryFromN8n, parseFailingNode } from '../../../../../lib/services/insights/operationalInsights.js';
import { recordAdoptionEvent } from '../../../../../lib/services/adoption/adoptionRepository.js';
import { STAGES } from '../../../../../lib/services/adoption/stages.js';

export const dynamic = 'force-dynamic';

export const POST = withAuth(async (user, request, { params }) => {
  await assertBlueprintOwner(user, params.id);

  const { version } = await request.json();
  const v = Number(version);

  // Architecture-first: guarantee a recommendation exists for this version
  // BEFORE building.
  const record = await getVersion(params.id, v).catch(() => null);
  const isComplete = (record?.status ?? record?.readiness?.status) === 'requirements_complete';
  const recommendation = record?.blueprint
    ? await ensureRecommendation({ blueprintId: params.id, blueprintVersion: v, userId: user.id, blueprint: record.blueprint }).catch(() => null)
    : null;

  // Enforcement: a COMPLETE Blueprint must have a persisted recommendation
  // before a final build. STRICT mode (production) blocks; otherwise we proceed
  // but surface an `export_warning` so provenance loss is never silent.
  const missingProvenance = isComplete && !recommendation?.id;
  if (missingProvenance && isStrictRecommendationEnforced()) {
    return NextResponse.json(
      { error: 'Cannot build yet: an architecture recommendation could not be created for this Blueprint. Please try again in a moment.' },
      { status: 409 }
    );
  }

  let workflow, usage;
  try {
    ({ workflow, usage } = await generateWorkflow({ blueprintId: params.id, version: v }));
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

  // Stamp this build with the recommendation it followed (export provenance).
  await recordExportRun({
    blueprintId: params.id, blueprintVersion: v, userId: user.id,
    selectedPlatform: 'n8n', kind: 'workflow', recommendation,
  });

  // Adoption Intelligence (1.3): building a workflow = "Architecture selected"
  // (a recommendation was followed) → "Implementation prepared". Best-effort.
  if (recommendation?.id) recordAdoptionEvent({ userId: user.id, stage: STAGES.ARCHITECTURE_SELECTED, blueprintId: params.id });
  recordAdoptionEvent({ userId: user.id, stage: STAGES.IMPLEMENTATION_PREPARED, blueprintId: params.id });

  return NextResponse.json({
    workflow,
    usage,
    recommendation_id: recommendation?.id ?? null,
    recommended_platform: recommendation?.export_platform ?? null,
    selected_platform: 'n8n',
    export_warning: missingProvenance ? 'Workflow generated without saved recommendation provenance.' : undefined,
  });
});
