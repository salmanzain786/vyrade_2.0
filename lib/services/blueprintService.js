import { generateAndValidate, patchBlueprintContent } from './blueprintGenerator.js';
import { checkReadiness } from './readiness.js';
import * as repo from './blueprintRepository.js';
import { emitBlueprintEvent, EVENT_TYPES } from './blueprintEvents.js';
import { askNextQuestion } from './clarificationAgent.js';
import { generateN8nWorkflow } from './n8nSpecialist.js';

export async function createInitialBlueprint({ sessionId, userId = null, conversationText, sourceTurnId }) {
  const content = await generateAndValidate(conversationText);
  const readiness = checkReadiness(content);

  const { blueprintId, version, status } = await repo.createBlueprint({
    sessionId, userId, content, readiness, sourceTurnId, createdBy: 'ai',
  });

  await emitBlueprintEvent(EVENT_TYPES.CREATED, { blueprintId, blueprintVersion: version });
  if (status === 'requirements_complete') {
    await emitBlueprintEvent(EVENT_TYPES.COMPLETED, { blueprintId, blueprintVersion: version });
  }

  return { blueprintId, version, status, blueprint: content, readiness };
}

export async function patchFromClarification({
  blueprintId, expectedVersion, newUserTurn, changeReason, sourceTurnId,
}) {
  const current = await repo.getVersion(blueprintId, expectedVersion);
  if (!current) throw new Error(`Blueprint version not found: ${blueprintId} v${expectedVersion}`);

  const updatedContent = await patchBlueprintContent(current.blueprint, newUserTurn);
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
  if (status === 'requirements_complete') {
    await emitBlueprintEvent(EVENT_TYPES.COMPLETED, { blueprintId, blueprintVersion: version });
  } else if (status === 'blocked') {
    await emitBlueprintEvent(EVENT_TYPES.BLOCKED, { blueprintId, blueprintVersion: version });
  }

  return { blueprintId, version, status, blueprint: updatedContent, readiness };
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

  if (status === 'requirements_complete') {
    await emitBlueprintEvent(EVENT_TYPES.COMPLETED, { blueprintId, blueprintVersion: version });
  } else {
    await emitBlueprintEvent(EVENT_TYPES.BLOCKED, { blueprintId, blueprintVersion: version });
  }

  return { blueprintId, version, status, readiness };
}

export async function getNextQuestion({ blueprintId, version, conversationSoFar }) {
  const current = await repo.getVersion(blueprintId, version);
  if (!current) throw new Error(`Blueprint version not found: ${blueprintId} v${version}`);
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

  const workflow = await generateN8nWorkflow(current.blueprint);

  workflow.meta = {
    ...(workflow.meta || {}),
    generated_from_blueprint_id: blueprintId,
    generated_from_blueprint_version: version,
  };

  // Persist the generated workflow so it can be re-downloaded later.
  await repo.saveWorkflow(blueprintId, version, workflow);

  return workflow;
}
