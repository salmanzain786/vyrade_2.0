import {
  mysqlTable, char, varchar, int, bigint, decimal, text, mediumtext, json, timestamp, tinyint,
  index, uniqueIndex, primaryKey,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

// Mirrors sql/schema.sql. Column names stay snake_case in MySQL; the JS side
// uses camelCase keys.

// --- Authentication (mirrors sql/auth.sql) ---

export const users = mysqlTable('users', {
  id: char('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 190 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  emailVerified: tinyint('email_verified').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  uniqEmail: uniqueIndex('uniq_users_email').on(t.email),
}));

export const authOtps = mysqlTable('auth_otps', {
  id: char('id', { length: 36 }).primaryKey(),
  userId: char('user_id', { length: 36 }).notNull(),
  purpose: varchar('purpose', { length: 32 }).notNull(), // email_verification | password_reset
  codeHash: char('code_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  attempts: int('attempts').notNull().default(0),
  consumedAt: timestamp('consumed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxLookup: index('idx_auth_otps_lookup').on(t.userId, t.purpose),
}));

// Audit trail for auth events + the source of truth for rate limiting.
export const authAttempts = mysqlTable('auth_attempts', {
  id: bigint('id', { mode: 'number' }).notNull().autoincrement().primaryKey(),
  event: varchar('event', { length: 32 }).notNull(),
  email: varchar('email', { length: 190 }),
  ip: varchar('ip', { length: 45 }),
  userId: char('user_id', { length: 36 }),
  outcome: varchar('outcome', { length: 16 }).notNull(), // success | failure | blocked
  reason: varchar('reason', { length: 160 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxEmail: index('idx_auth_attempts_email').on(t.email, t.event, t.createdAt),
  idxIp: index('idx_auth_attempts_ip').on(t.ip, t.event, t.createdAt),
}));

export const automationBlueprints = mysqlTable('automation_blueprints', {
  id: char('id', { length: 36 }).primaryKey(),
  sessionId: char('session_id', { length: 36 }).notNull(),
  userId: char('user_id', { length: 36 }),
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
  userId: char('user_id', { length: 36 }),
  title: varchar('title', { length: 200 }),
  totalTokens: bigint('total_tokens', { mode: 'number' }).notNull().default(0),
  totalCostUsd: decimal('total_cost_usd', { precision: 14, scale: 6 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const conversationMessages = mysqlTable('conversation_messages', {
  seq: bigint('seq', { mode: 'number' }).notNull().autoincrement(),
  id: char('id', { length: 36 }).notNull(),
  sessionId: char('session_id', { length: 36 }).notNull(),
  role: varchar('role', { length: 16 }).notNull(), // user | agent | system
  content: text('content').notNull(),
  model: varchar('model', { length: 64 }),
  promptTokens: int('prompt_tokens').notNull().default(0),
  completionTokens: int('completion_tokens').notNull().default(0),
  totalTokens: int('total_tokens').notNull().default(0),
  costUsd: decimal('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
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

// --- Cost Intelligence: pricing source registry (mirrors sql/pricing.sql) ---
// Provenance for every price the cost engine may use. Confidence governance
// ("only official pages → high") lives in lib/services/cost/pricingSources.js.
export const pricingSources = mysqlTable('pricing_sources', {
  id: char('id', { length: 36 }).primaryKey(),
  provider: varchar('provider', { length: 64 }).notNull(),
  componentType: varchar('component_type', { length: 64 }).notNull(),
  pricingUrl: varchar('pricing_url', { length: 512 }),
  sourceType: varchar('source_type', { length: 32 }).notNull().default('unknown'),
  extractionMethod: varchar('extraction_method', { length: 32 }).notNull().default('manual'),
  confidence: varchar('confidence', { length: 16 }).notNull().default('unknown'),
  rawSnapshot: mediumtext('raw_snapshot'),
  parsedJson: json('parsed_json'),
  notes: text('notes'),
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  idxLookup: index('idx_pricing_lookup').on(t.provider, t.componentType),
  uqSource: uniqueIndex('uq_pricing_source').on(t.provider, t.componentType, t.sourceType),
}));

// --- Cost Intelligence: connector pricing profiles (mirrors sql/connector_pricing.sql) ---
export const connectorCostProfiles = mysqlTable('connector_cost_profiles', {
  id: char('id', { length: 36 }).primaryKey(),
  connectorId: varchar('connector_id', { length: 128 }),
  connectorName: varchar('connector_name', { length: 190 }).notNull(),
  platform: varchar('platform', { length: 32 }),
  systemName: varchar('system_name', { length: 190 }),
  pricingModel: varchar('pricing_model', { length: 32 }).notNull().default('unknown'),
  pricingUrl: varchar('pricing_url', { length: 512 }),
  freeTierAvailable: tinyint('free_tier_available'),
  requiresPaidPlan: tinyint('requires_paid_plan'),
  unitName: varchar('unit_name', { length: 64 }),
  unitPrice: decimal('unit_price', { precision: 12, scale: 6 }),
  includedUnits: int('included_units'),
  overagePrice: decimal('overage_price', { precision: 12, scale: 6 }),
  rateLimitNotes: text('rate_limit_notes'),
  confidence: varchar('confidence', { length: 16 }).notNull().default('unknown'),
  notes: text('notes'),
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  idxSystem: index('idx_connector_system').on(t.systemName),
  idxName: index('idx_connector_name').on(t.connectorName),
  uqProfile: uniqueIndex('uq_connector_profile').on(t.connectorName, t.platform),
}));

// Re-exported for repositories that need raw SQL fragments.
export { sql };
