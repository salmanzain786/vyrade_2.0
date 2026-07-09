import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import {
  automationBlueprints,
  automationBlueprintVersions,
  blueprintWorkflows,
} from '../db/schema.js';

export class VersionConflictError extends Error {
  constructor(expected, actual) {
    super(`Version conflict: expected ${expected}, current is ${actual}`);
    this.name = 'VersionConflictError';
    this.statusCode = 409;
  }
}

// mysql2 usually hands back JSON columns already parsed; be defensive either way.
const asJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

export async function createBlueprint({ sessionId, content, readiness, createdBy = 'ai', sourceTurnId = null }) {
  const blueprintId = uuidv4();
  const versionId = uuidv4();
  const status = readiness.status;

  await db.transaction(async (tx) => {
    await tx.insert(automationBlueprints).values({
      id: blueprintId,
      sessionId,
      currentVersion: 1,
      status,
    });

    await tx.insert(automationBlueprintVersions).values({
      id: versionId,
      blueprintId,
      version: 1,
      schemaVersion: '1.0',
      blueprintJson: content,
      readinessJson: readiness,
      changeReason: 'Initial Blueprint from first clarified turn',
      sourceTurnId,
      createdBy,
    });
  });

  return { blueprintId, version: 1, status };
}

export async function patchBlueprint({
  blueprintId, expectedVersion, content, readiness,
  changeReason, sourceTurnId, createdBy = 'ai',
}) {
  // Throwing inside the callback rolls the transaction back.
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ currentVersion: automationBlueprints.currentVersion })
      .from(automationBlueprints)
      .where(eq(automationBlueprints.id, blueprintId))
      .for('update');

    if (rows.length === 0) throw new Error(`Blueprint not found: ${blueprintId}`);

    const currentVersion = rows[0].currentVersion;
    if (currentVersion !== expectedVersion) {
      throw new VersionConflictError(expectedVersion, currentVersion);
    }

    const newVersion = currentVersion + 1;

    await tx.insert(automationBlueprintVersions).values({
      id: uuidv4(),
      blueprintId,
      version: newVersion,
      schemaVersion: '1.0',
      blueprintJson: content,
      readinessJson: readiness,
      changeReason: changeReason || null,
      sourceTurnId: sourceTurnId || null,
      createdBy,
    });

    await tx
      .update(automationBlueprints)
      .set({ currentVersion: newVersion, status: readiness.status })
      .where(eq(automationBlueprints.id, blueprintId));

    return { blueprintId, version: newVersion, status: readiness.status };
  });
}

async function findParent(blueprintId) {
  const [parent] = await db
    .select()
    .from(automationBlueprints)
    .where(eq(automationBlueprints.id, blueprintId))
    .limit(1);
  return parent || null;
}

async function findVersion(blueprintId, version) {
  const [row] = await db
    .select()
    .from(automationBlueprintVersions)
    .where(and(
      eq(automationBlueprintVersions.blueprintId, blueprintId),
      eq(automationBlueprintVersions.version, version),
    ))
    .limit(1);
  return row || null;
}

export async function getLatest(blueprintId) {
  const parent = await findParent(blueprintId);
  if (!parent) return null;
  const versionRow = await findVersion(blueprintId, parent.currentVersion);
  if (!versionRow) return null;
  return formatBlueprintRow(parent, versionRow);
}

export async function getVersion(blueprintId, version) {
  const parent = await findParent(blueprintId);
  if (!parent) return null;
  const versionRow = await findVersion(blueprintId, version);
  if (!versionRow) return null;
  return formatBlueprintRow(parent, versionRow);
}

export async function getBySession(sessionId) {
  const [row] = await db
    .select({ id: automationBlueprints.id })
    .from(automationBlueprints)
    .where(eq(automationBlueprints.sessionId, sessionId))
    .orderBy(desc(automationBlueprints.updatedAt))
    .limit(1);
  if (!row) return null;
  return getLatest(row.id);
}

export async function saveWorkflow(blueprintId, blueprintVersion, workflow, target = 'n8n') {
  const id = uuidv4();
  await db.insert(blueprintWorkflows).values({
    id,
    blueprintId,
    blueprintVersion,
    target,
    workflowJson: workflow,
  });
  return { id };
}

export async function getLatestWorkflow(blueprintId) {
  const [row] = await db
    .select({ workflowJson: blueprintWorkflows.workflowJson })
    .from(blueprintWorkflows)
    .where(eq(blueprintWorkflows.blueprintId, blueprintId))
    .orderBy(desc(blueprintWorkflows.seq))
    .limit(1);
  if (!row) return null;
  return asJson(row.workflowJson);
}

function formatBlueprintRow(parent, versionRow) {
  return {
    blueprint_id: parent.id,
    session_id: parent.sessionId,
    version: versionRow.version,
    schema_version: versionRow.schemaVersion,
    status: parent.status,
    blueprint: asJson(versionRow.blueprintJson),
    readiness: asJson(versionRow.readinessJson),
    created_at: versionRow.createdAt,
  };
}
