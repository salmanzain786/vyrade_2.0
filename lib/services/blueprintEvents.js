import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/db.js';
import { automationBlueprintEvents } from '../db/schema.js';

export const EVENT_TYPES = {
  CREATED: 'blueprint.created',
  UPDATED: 'blueprint.updated',
  COMPLETED: 'blueprint.completed',
  BLOCKED: 'blueprint.blocked',
  ARCHIVED: 'blueprint.archived',
};

/**
 * Section 17/28 — persisted event log for traceability. Swap the insert
 * for a real message bus (SNS/SQS/Kafka) once you have multiple services.
 */
export async function emitBlueprintEvent(eventType, { blueprintId, blueprintVersion, payload = {} }) {
  await db.insert(automationBlueprintEvents).values({
    id: uuidv4(),
    blueprintId,
    blueprintVersion,
    eventType,
    payloadJson: payload,
  });
}
