import {
  mysqlTable, char, varchar, int, bigint, text, json, timestamp,
  index, uniqueIndex, primaryKey,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

// Mirrors sql/schema.sql. Column names stay snake_case in MySQL; the JS side
// uses camelCase keys.

export const automationBlueprints = mysqlTable('automation_blueprints', {
  id: char('id', { length: 36 }).primaryKey(),
  sessionId: char('session_id', { length: 36 }).notNull(),
  currentVersion: int('current_version').notNull().default(0),
  status: varchar('status', { length: 32 }).notNull().default('collecting_requirements'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  idxSession: index('idx_session').on(t.sessionId),
}));

export const automationBlueprintVersions = mysqlTable('automation_blueprint_versions', {
  id: char('id', { length: 36 }).primaryKey(),
  blueprintId: char('blueprint_id', { length: 36 }).notNull(),
  version: int('version').notNull(),
  schemaVersion: varchar('schema_version', { length: 16 }).notNull().default('1.0'),
  blueprintJson: json('blueprint_json').notNull(),
  readinessJson: json('readiness_json'),
  changeReason: text('change_reason'),
  sourceTurnId: varchar('source_turn_id', { length: 64 }),
  createdBy: varchar('created_by', { length: 16 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniqBlueprintVersion: uniqueIndex('uniq_blueprint_version').on(t.blueprintId, t.version),
  idxBlueprintVersionDesc: index('idx_blueprint_version_desc').on(t.blueprintId, t.version),
}));

export const conversations = mysqlTable('conversations', {
  sessionId: char('session_id', { length: 36 }).primaryKey(),
  title: varchar('title', { length: 200 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const conversationMessages = mysqlTable('conversation_messages', {
  seq: bigint('seq', { mode: 'number' }).notNull().autoincrement(),
  id: char('id', { length: 36 }).notNull(),
  sessionId: char('session_id', { length: 36 }).notNull(),
  role: varchar('role', { length: 16 }).notNull(), // user | agent | system
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.seq] }),
  uniqMessageId: uniqueIndex('uniq_message_id').on(t.id),
  idxConversationMessages: index('idx_conversation_messages').on(t.sessionId, t.seq),
}));

export const blueprintWorkflows = mysqlTable('blueprint_workflows', {
  seq: bigint('seq', { mode: 'number' }).notNull().autoincrement(),
  id: char('id', { length: 36 }).notNull(),
  blueprintId: char('blueprint_id', { length: 36 }).notNull(),
  blueprintVersion: int('blueprint_version').notNull(),
  target: varchar('target', { length: 32 }).notNull().default('n8n'),
  workflowJson: json('workflow_json').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.seq] }),
  uniqWorkflowId: uniqueIndex('uniq_workflow_id').on(t.id),
  idxBlueprintWorkflows: index('idx_blueprint_workflows').on(t.blueprintId, t.seq),
}));

export const automationBlueprintEvents = mysqlTable('automation_blueprint_events', {
  id: char('id', { length: 36 }).primaryKey(),
  blueprintId: char('blueprint_id', { length: 36 }).notNull(),
  blueprintVersion: int('blueprint_version').notNull(),
  eventType: varchar('event_type', { length: 32 }).notNull(),
  payloadJson: json('payload_json'),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
}, (t) => ({
  idxBlueprintEvents: index('idx_blueprint_events').on(t.blueprintId, t.occurredAt),
}));

// Re-exported for repositories that need raw SQL fragments.
export { sql };
