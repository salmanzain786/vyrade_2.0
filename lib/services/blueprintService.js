import { generateAndValidate, patchBlueprintContent } from './blueprintGenerator.js';
import { checkReadiness } from './readiness.js';
import * as repo from './blueprintRepository.js';
import { getLastAssistantQuestion } from './conversationRepository.js';
import { emitBlueprintEvent, EVENT_TYPES } from './blueprintEvents.js';
import { askNextQuestion } from './clarificationAgent.js';
import { generateN8nWorkflow } from './n8nSpecialist.js';
import { retrieveMcpForSystems } from './retrieval.js';
import { buildClaudePackage } from './claudeExporter.js';
import { BlueprintNotReadyError, StaleVersionError } from './blueprintErrors.js';

// Emit the lifecycle event that matches the persisted status, so the event log
// can never say `blueprint.blocked` while the row is `collecting_requirements`
// (P1 bug). 'collecting_requirements' emits nothing.
async function emitStatusEvent(status, blueprintId, blueprintVersion) {
  if (status === 'requirements_complete') {
    await emitBlueprintEvent(EVENT_TYPES.COMPLETED, { blueprintId, blueprintVersion });
  } else if (status === 'blocked') {
    await emitBlueprintEvent(EVENT_TYPES.BLOCKED, { blueprintId, blueprintVersion });
  }
}

export async function createInitialBlueprint({ sessionId, userId = null, conversationText, sourceTurnId }) {
  const { blueprint: content, usage } = await generateAndValidate(conversationText);
  const readiness = checkReadiness(content);

  const { blueprintId, version, status } = await repo.createBlueprint({
    sessionId, userId, content, readiness, sourceTurnId, createdBy: 'ai',
  });

  await emitBlueprintEvent(EVENT_TYPES.CREATED, { blueprintId, blueprintVersion: version });
  await emitStatusEvent(status, blueprintId, version);

  // `usage` is the token cost of generating this blueprint; the caller forwards
  // it so it can be attributed to the conversation (see the stream route).
  return { blueprintId, version, status, blueprint: content, readiness, usage };
}

export async function patchFromClarification({
  blueprintId, expectedVersion, newUserTurn, changeReason, sourceTurnId,
}) {
  const current = await repo.getVersion(blueprintId, expectedVersion);
  if (!current) throw new Error(`Blueprint version not found: ${blueprintId} v${expectedVersion}`);

  // Pull the QUESTION this answer responds to from the conversation store
  // (server-side — the client only sends the answer). Without it the patch
  // engine can misapply an answer like "Only on failures" or "Sarah" (P0 bug).
  const question = await getLastAssistantQuestion(current.session_id);

  const { blueprint: updatedContent, usage } = await patchBlueprintContent(current.blueprint, {
    question,
    answer: newUserTurn,
  });
  const readiness = checkReadiness(updatedContent);

  const { version, status } = await repo.patchBlueprint({
    blueprintId,
    expectedVersion,
    content: updatedContent,
    readiness,
    changeReason: changeReason || `User clarification: "${newUserTurn}"`,
    sourceTurnId,
    createdBy: 'ai',
  });

  await emitBlueprintEvent(EVENT_TYPES.UPDATED, { blueprintId, blueprintVersion: version });
  await emitStatusEvent(status, blueprintId, version);

  return { blueprintId, version, status, blueprint: updatedContent, readiness, usage };
}

export async function finalizeBlueprint({ blueprintId, expectedVersion }) {
  const current = await repo.getVersion(blueprintId, expectedVersion);
  if (!current) throw new Error(`Blueprint version not found: ${blueprintId} v${expectedVersion}`);

  const readiness = checkReadiness(current.blueprint);

  const { version, status } = await repo.patchBlueprint({
    blueprintId,
    expectedVersion,
    content: current.blueprint,
    readiness,
    changeReason: 'Final normalization pass',
    createdBy: 'system',
  });

  // Emit the event that MATCHES the real status — previously this emitted
  // BLOCKED for any non-complete status, even while collecting_requirements.
  await emitStatusEvent(status, blueprintId, version);

  return { blueprintId, version, status, readiness };
}

export async function getNextQuestion({ blueprintId, version, conversationSoFar }) {
  const current = await repo.getVersion(blueprintId, version);
  if (!current) throw new Error(`Blueprint version not found: ${blueprintId} v${version}`);
  // { text, done, usage }
  return askNextQuestion(current.blueprint, conversationSoFar);
}

/**
 * Section 23-24 — Retrieval Router + n8n Specialist. Pulls n8n node knowledge
 * from Pinecone for this Blueprint version and synthesizes an importable n8n
 * workflow grounded in that knowledge. Provenance (Blueprint id/version) is
 * stamped on the result for the observability trace (Section 28).
 */
export async function generateWorkflow({ blueprintId, version }) {
  const current = await repo.getVersion(blueprintId, version);
  if (!current) throw new Error(`Blueprint version not found: ${blueprintId} v${version}`);

  // --- Business-logic gates (server-side, NOT the UI's disabled button) ---

  // 1) Only ever generate from the CURRENT Blueprint version. Generating from a
  //    superseded version would produce a workflow that's stale on arrival.
  if (!current.is_current) {
    throw new StaleVersionError(version, current.current_version);
  }

  // 2) The Blueprint must actually be ready. Re-derive readiness from the
  //    content rather than trusting a stored/older snapshot.
  const readiness = checkReadiness(current.blueprint);
  if (readiness.status !== 'requirements_complete') {
    throw new BlueprintNotReadyError(readiness.status, readiness.blocking_unknowns);
  }

  const { workflow, usage } = await generateN8nWorkflow(current.blueprint);

  workflow.meta = {
    ...(workflow.meta || {}),
    generated_from_blueprint_id: blueprintId,
    generated_from_blueprint_version: version,
  };

  // Persist the generated workflow so it can be re-downloaded later.
  await repo.saveWorkflow(blueprintId, version, workflow);

  return { workflow, usage };
}

/**
 * Task 10 — Claude Code export package. Produces a developer-ready markdown
 * bundle (NOT an n8n workflow) from the Blueprint plus MCP connectors retrieved
 * from the Vyrade MCP index. Returns { name, files, prompt, mcpCount }.
 */
export async function generateClaudePackage({ blueprintId, version = null }) {
  const current = version
    ? await repo.getVersion(blueprintId, version)
    : await repo.getLatest(blueprintId);
  if (!current) throw new Error(`Blueprint not found: ${blueprintId}`);

  const mcp = await retrieveMcpForSystems(current.blueprint);
  const { files, prompt } = buildClaudePackage({ bp: current.blueprint, mcp });
  return { name: current.blueprint?.name || 'automation', files, prompt, mcpCount: mcp.matchCount };
}
