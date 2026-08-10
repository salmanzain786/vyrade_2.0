/**
 * Draft Blueprint generation from a discovery session (Work Intelligence,
 * Phase 2.4/2.5). REUSES Vyrade's existing generation engine
 * (createInitialBlueprint → generateAndValidate) with a task+answers narrative
 * as the new input source — no parallel generator. The resulting Blueprint is a
 * normal Blueprint, so the platform-recommendation and cost engines (2.5) run
 * over it unchanged, and it appears in the report/compliance/adoption surfaces.
 */
import { randomUUID } from 'crypto';
import { addMessage } from '../../conversationRepository.js';
import { createInitialBlueprint } from '../../blueprintService.js';
import { buildProcessNarrative } from './narrative.js';
import { attachBlueprint } from './discoveryRepository.js';
import { createOrUpdateLink } from '../writeback/taskLinkRepository.js';

export async function createBlueprintFromDiscovery({ discovery, userId }) {
  const narrative = buildProcessNarrative(discovery.context || {}, discovery.questions || [], discovery.answers || {});
  const sessionId = randomUUID();

  // Seed the conversation so the Blueprint lives in the normal system (chat
  // history, report back-link). The user message is the "Explore" entry point.
  await addMessage(sessionId, 'user', `Explore Automation With Vyrade — from task: ${discovery.task_name || 'task'}`, userId);

  const bp = await createInitialBlueprint({ sessionId, userId, conversationText: narrative, sourceTurnId: null });
  await attachBlueprint(discovery.id, { blueprintId: bp.blueprintId, sessionId });

  // Phase 4.3 — establish the Blueprint ↔ task link at creation (best-effort).
  if (discovery.external_task_id) {
    try {
      await createOrUpdateLink({ blueprintId: bp.blueprintId, userId, connectionId: discovery.connection_id, platform: discovery.platform, externalTaskId: discovery.external_task_id });
    } catch { /* linking is best-effort — never fail generation on it */ }
  }

  return { blueprintId: bp.blueprintId, sessionId, status: bp.status, readiness: bp.readiness };
}

export default { createBlueprintFromDiscovery };
