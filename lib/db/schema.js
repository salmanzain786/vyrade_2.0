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

// --- Workflow Encyclopedia (mirrors sql/workflow_encyclopedia.sql) ---
export const workflowEncyclopedia = mysqlTable('workflow_encyclopedia', {
  sourceId: int('source_id').notNull().primaryKey(),
  platform: varchar('platform', { length: 32 }).notNull().default('n8n'),
  name: varchar('name', { length: 512 }),
  description: text('description'),
  fingerprint: varchar('fingerprint', { length: 32 }).notNull(),
  category: varchar('category', { length: 48 }).notNull(),
  categoryLabel: varchar('category_label', { length: 96 }),
  categories: json('categories'),
  tags: json('tags'),
  integrations: json('integrations'),
  integrationCount: int('integration_count').notNull().default(0),
  triggerType: varchar('trigger_type', { length: 24 }),
  complexity: varchar('complexity', { length: 16 }),
  nodeCount: int('node_count').notNull().default(0),
  qualityScore: int('quality_score').notNull().default(0),
  qualityTier: varchar('quality_tier', { length: 16 }),
  isLowQuality: tinyint('is_low_quality').notNull().default(0),
  isCanonical: tinyint('is_canonical').notNull().default(1),
  duplicateOf: int('duplicate_of'),
  blueprintPattern: json('blueprint_pattern'),
  curatedAt: timestamp('curated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  idxBrowse: index('idx_enc_browse').on(t.platform, t.category, t.isCanonical, t.isLowQuality, t.qualityScore),
  idxTop: index('idx_enc_top').on(t.platform, t.isCanonical, t.isLowQuality, t.qualityScore),
  idxFingerprint: index('idx_enc_fingerprint').on(t.fingerprint),
}));

// --- Tool / API / MCP Intelligence (mirrors sql/tool_intelligence.sql) ---
export const toolIntelligence = mysqlTable('tool_intelligence', {
  id: char('id', { length: 36 }).primaryKey(),
  toolName: varchar('tool_name', { length: 190 }).notNull(),
  slug: varchar('slug', { length: 96 }),
  category: varchar('category', { length: 48 }),
  apiAvailable: tinyint('api_available'),
  apiBaseUrl: varchar('api_base_url', { length: 512 }),
  documentationUrl: varchar('documentation_url', { length: 512 }),
  authMethod: varchar('auth_method', { length: 32 }).notNull().default('unknown'),
  authNotes: text('auth_notes'),
  rateLimits: text('rate_limits'),
  mcpAvailable: tinyint('mcp_available'),
  mcpServer: varchar('mcp_server', { length: 190 }),
  mcpUrl: varchar('mcp_url', { length: 512 }),
  pricingModel: varchar('pricing_model', { length: 32 }),
  pricingUrl: varchar('pricing_url', { length: 512 }),
  useCases: json('use_cases'),
  integrationComplexity: varchar('integration_complexity', { length: 16 }).notNull().default('unknown'),
  securityRisk: varchar('security_risk', { length: 16 }).notNull().default('unknown'),
  securityNotes: text('security_notes'),
  n8nNodeType: varchar('n8n_node_type', { length: 96 }),
  confidence: varchar('confidence', { length: 16 }).notNull().default('unknown'),
  lastCheckedAt: timestamp('last_checked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  uqName: uniqueIndex('uq_tool_name').on(t.toolName),
  idxSlug: index('idx_tool_slug').on(t.slug),
  idxCategory: index('idx_tool_category').on(t.category),
}));

// --- Operational Insights (mirrors sql/operational_events.sql) ---
export const operationalEvents = mysqlTable('operational_events', {
  id: bigint('id', { mode: 'number' }).notNull().autoincrement().primaryKey(),
  eventType: varchar('event_type', { length: 48 }).notNull(),
  platform: varchar('platform', { length: 32 }),
  blueprintId: char('blueprint_id', { length: 36 }),
  userId: char('user_id', { length: 36 }),
  nodeType: varchar('node_type', { length: 96 }),
  tool: varchar('tool', { length: 96 }),
  errorCategory: varchar('error_category', { length: 48 }),
  severity: varchar('severity', { length: 16 }).notNull().default('info'),
  tokens: int('tokens'),
  costUsd: decimal('cost_usd', { precision: 12, scale: 6 }),
  metric: int('metric'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxTypeTime: index('idx_ops_type_time').on(t.eventType, t.createdAt),
  idxNode: index('idx_ops_node').on(t.nodeType, t.createdAt),
  idxTool: index('idx_ops_tool').on(t.tool, t.createdAt),
  idxBlueprint: index('idx_ops_blueprint').on(t.blueprintId),
}));

// --- Recommendation persistence (mirrors sql/recommendations.sql) ---
export const recommendationRuns = mysqlTable('recommendation_runs', {
  id: char('id', { length: 36 }).primaryKey(),
  blueprintId: char('blueprint_id', { length: 36 }).notNull(),
  blueprintVersion: int('blueprint_version').notNull(),
  userId: char('user_id', { length: 36 }),
  recommendedPlatform: varchar('recommended_platform', { length: 48 }),
  confidence: varchar('confidence', { length: 16 }),
  engineVersion: varchar('engine_version', { length: 32 }).notNull().default('rules-v1'),
  monthlyRuns: int('monthly_runs'),
  recommendationHash: char('recommendation_hash', { length: 64 }),
  recommendationJson: json('recommendation_json').notNull(),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxLatest: index('idx_rec_latest').on(t.blueprintId, t.blueprintVersion, t.createdAt),
  idxHash: index('idx_rec_hash').on(t.blueprintId, t.blueprintVersion, t.recommendationHash),
  idxBlueprint: index('idx_rec_blueprint').on(t.blueprintId),
}));

// --- Export provenance (mirrors sql/export_runs.sql) ---
export const exportRuns = mysqlTable('export_runs', {
  id: char('id', { length: 36 }).primaryKey(),
  blueprintId: char('blueprint_id', { length: 36 }).notNull(),
  blueprintVersion: int('blueprint_version').notNull(),
  userId: char('user_id', { length: 36 }),
  selectedPlatform: varchar('selected_platform', { length: 32 }).notNull(),
  kind: varchar('kind', { length: 16 }),
  recommendationId: char('recommendation_id', { length: 36 }),
  recommendedPlatform: varchar('recommended_platform', { length: 48 }),
  followedRecommendation: tinyint('followed_recommendation'),
  isRecommendationOverride: tinyint('is_recommendation_override'),
  overrideReason: varchar('override_reason', { length: 48 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxBlueprint: index('idx_export_blueprint').on(t.blueprintId, t.createdAt),
  idxRecommendation: index('idx_export_recommendation').on(t.recommendationId),
  idxOverride: index('idx_export_override').on(t.isRecommendationOverride, t.createdAt),
}));

// Re-exported for repositories that need raw SQL fragments.
export { sql };
