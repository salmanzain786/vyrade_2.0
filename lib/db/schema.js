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
  isAdmin: tinyint('is_admin').notNull().default(0),
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

// Governance & Compliance Scanner — persisted scan snapshots. One immutable
// row per scan, for history + before/after comparison (Phase 7). Mirrors
// sql/governance_scans.sql.
export const governanceScans = mysqlTable('governance_scans', {
  id: bigint('id', { mode: 'number' }).notNull().autoincrement().primaryKey(),
  blueprintId: char('blueprint_id', { length: 36 }).notNull(),
  userId: char('user_id', { length: 36 }),
  platform: varchar('platform', { length: 32 }).notNull().default('n8n'),
  workflowName: varchar('workflow_name', { length: 512 }),
  nodeCount: int('node_count').notNull().default(0),
  versionCount: int('version_count').notNull().default(0),
  hadWorkflow: tinyint('had_workflow').notNull().default(0),
  readinessPct: int('readiness_pct').notNull().default(0),
  readinessBand: varchar('readiness_band', { length: 24 }),
  securityRiskLevel: varchar('security_risk_level', { length: 16 }),
  findingsTotal: int('findings_total').notNull().default(0),
  worstSeverity: varchar('worst_severity', { length: 16 }),
  manualReviewCount: int('manual_review_count').notNull().default(0),
  summaryJson: json('summary_json'),
  findingsJson: json('findings_json'),
  reportJson: json('report_json'),
  frameworkJson: json('framework_json'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxGovScanBlueprint: index('idx_gov_scan_blueprint').on(t.blueprintId, t.createdAt),
}));

// Governance & Policy Requirements (Phase 6.1) — the human-authored contract a
// workflow is diffed against. Separate from the versioned Blueprint on purpose.
// Mirrors sql/blueprint_policies.sql.
export const blueprintPolicies = mysqlTable('blueprint_policies', {
  blueprintId: char('blueprint_id', { length: 36 }).notNull().primaryKey(),
  policyJson: json('policy_json').notNull(),
  enabled: tinyint('enabled').notNull().default(0),
  authoredBy: char('authored_by', { length: 36 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

// Remediation Loop — per-finding resolution tracking (Phase 7.2). Mirrors
// sql/finding_resolutions.sql.
export const findingResolutions = mysqlTable('finding_resolutions', {
  blueprintId: char('blueprint_id', { length: 36 }).notNull(),
  findingKey: varchar('finding_key', { length: 255 }).notNull(),
  findingType: varchar('finding_type', { length: 64 }).notNull(),
  node: varchar('node', { length: 255 }),
  status: varchar('status', { length: 24 }).notNull().default('open'),
  note: varchar('note', { length: 1000 }),
  updatedBy: char('updated_by', { length: 36 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.blueprintId, t.findingKey] }),
}));

// ── AI Adoption Intelligence — Phase 1. Mirrors sql/adoption_intelligence.sql. ──
export const userProfiles = mysqlTable('user_profiles', {
  userId: char('user_id', { length: 36 }).notNull().primaryKey(),
  role: varchar('role', { length: 96 }),
  jobTitle: varchar('job_title', { length: 160 }),
  department: varchar('department', { length: 96 }),
  industry: varchar('industry', { length: 96 }),
  companySize: varchar('company_size', { length: 32 }),
  technicalSkill: varchar('technical_skill', { length: 24 }),
  responsibilities: json('responsibilities'),
  currentAiTools: json('current_ai_tools'),
  automationPlatforms: json('automation_platforms'),
  bottlenecks: json('bottlenecks'),
  completed: tinyint('completed').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const opportunityMap = mysqlTable('opportunity_map', {
  userId: char('user_id', { length: 36 }).notNull(),
  areaKey: varchar('area_key', { length: 64 }).notNull(),
  label: varchar('label', { length: 160 }).notNull(),
  department: varchar('department', { length: 96 }),
  estHoursMonth: int('est_hours_month'),
  complexity: varchar('complexity', { length: 16 }),
  status: varchar('status', { length: 24 }).notNull().default('suggested'),
  blueprintId: char('blueprint_id', { length: 36 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.areaKey] }),
  idxUserStatus: index('idx_opp_user_status').on(t.userId, t.status),
}));

export const adoptionEvents = mysqlTable('adoption_events', {
  id: bigint('id', { mode: 'number' }).notNull().autoincrement().primaryKey(),
  userId: char('user_id', { length: 36 }).notNull(),
  stage: varchar('stage', { length: 32 }).notNull(),
  blueprintId: char('blueprint_id', { length: 36 }),
  areaKey: varchar('area_key', { length: 64 }),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxUser: index('idx_adoption_user').on(t.userId, t.createdAt),
  idxStage: index('idx_adoption_stage').on(t.stage),
  idxUserStage: index('idx_adoption_user_stage').on(t.userId, t.stage),
}));

// ── AI Adoption Intelligence — Phase 2 (multi-tenancy). Mirrors
// sql/organizations.sql. Additive: blueprint ownership is unchanged. ──
export const organizations = mysqlTable('organizations', {
  id: char('id', { length: 36 }).notNull().primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  ownerUserId: char('owner_user_id', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({ idxOwner: index('idx_org_owner').on(t.ownerUserId) }));

export const departments = mysqlTable('departments', {
  id: char('id', { length: 36 }).notNull().primaryKey(),
  orgId: char('org_id', { length: 36 }).notNull(),
  key: varchar('key', { length: 64 }).notNull(),
  label: varchar('label', { length: 96 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniqOrgDept: uniqueIndex('uniq_org_dept').on(t.orgId, t.key),
  idxOrg: index('idx_dept_org').on(t.orgId),
}));

export const orgMembers = mysqlTable('org_members', {
  orgId: char('org_id', { length: 36 }).notNull(),
  userId: char('user_id', { length: 36 }).notNull(),
  role: varchar('role', { length: 16 }).notNull().default('member'),
  department: varchar('department', { length: 64 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.orgId, t.userId] }),
  idxUser: index('idx_member_user').on(t.userId),
  idxDept: index('idx_member_dept').on(t.orgId, t.department),
}));

export const orgInvitations = mysqlTable('org_invitations', {
  id: char('id', { length: 36 }).notNull().primaryKey(),
  orgId: char('org_id', { length: 36 }).notNull(),
  email: varchar('email', { length: 190 }).notNull(),
  role: varchar('role', { length: 16 }).notNull().default('member'),
  department: varchar('department', { length: 64 }),
  token: char('token', { length: 64 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  invitedBy: char('invited_by', { length: 36 }),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniqToken: uniqueIndex('uniq_org_invite_token').on(t.token),
  idxOrg: index('idx_inv_org').on(t.orgId, t.status),
  idxEmail: index('idx_inv_email').on(t.email),
}));

// ── AI Adoption Intelligence — Phase 3 (Implementation Tracking). Mirrors
// sql/blueprint_implementations.sql. ──
export const blueprintImplementations = mysqlTable('blueprint_implementations', {
  blueprintId: char('blueprint_id', { length: 36 }).notNull().primaryKey(),
  userId: char('user_id', { length: 36 }).notNull(),
  implemented: tinyint('implemented').notNull().default(0),
  active: tinyint('active').notNull().default(0),
  platform: varchar('platform', { length: 32 }),
  deployedAt: timestamp('deployed_at'),
  owner: varchar('owner', { length: 160 }),
  usageVolume: int('usage_volume'),
  timeSavedHours: int('time_saved_hours'),
  outcomeNotes: varchar('outcome_notes', { length: 1000 }),
  measured: tinyint('measured').notNull().default(0),
  minutesSavedPerRun: int('minutes_saved_per_run'),
  implementedAt: timestamp('implemented_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  idxUser: index('idx_impl_user').on(t.userId),
  idxActive: index('idx_impl_active').on(t.active),
}));

// ── AI Adoption Intelligence — Phase 4 (Execution Telemetry). Mirrors
// sql/execution_telemetry.sql. ──
export const telemetryTokens = mysqlTable('telemetry_tokens', {
  token: char('token', { length: 64 }).notNull().primaryKey(),
  userId: char('user_id', { length: 36 }).notNull(),
  label: varchar('label', { length: 96 }),
  revoked: tinyint('revoked').notNull().default(0),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({ idxUser: index('idx_tok_user').on(t.userId, t.revoked) }));

export const executionEvents = mysqlTable('execution_events', {
  id: bigint('id', { mode: 'number' }).notNull().autoincrement().primaryKey(),
  blueprintId: char('blueprint_id', { length: 36 }),
  userId: char('user_id', { length: 36 }).notNull(),
  platform: varchar('platform', { length: 32 }).notNull().default('n8n'),
  externalWorkflowId: varchar('external_workflow_id', { length: 190 }),
  status: varchar('status', { length: 16 }).notNull(),
  durationMs: int('duration_ms'),
  errorCategory: varchar('error_category', { length: 48 }),
  humanIntervention: tinyint('human_intervention').notNull().default(0),
  occurredAt: timestamp('occurred_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxBp: index('idx_exec_bp').on(t.blueprintId, t.occurredAt),
  idxUser: index('idx_exec_user').on(t.userId, t.occurredAt),
  idxStatus: index('idx_exec_status').on(t.status),
}));

// ── Work Intelligence — Phase 1. Mirrors sql/work_intelligence.sql. ──
export const platformConnections = mysqlTable('platform_connections', {
  id: char('id', { length: 36 }).notNull().primaryKey(),
  userId: char('user_id', { length: 36 }).notNull(),
  orgId: char('org_id', { length: 36 }),
  platform: varchar('platform', { length: 32 }).notNull(),
  externalAccountId: varchar('external_account_id', { length: 190 }),
  accountName: varchar('account_name', { length: 190 }),
  accessTokenEnc: varchar('access_token_enc', { length: 1024 }),
  refreshTokenEnc: varchar('refresh_token_enc', { length: 1024 }),
  tokenExpiresAt: timestamp('token_expires_at'),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  scopeConfig: json('scope_config'),
  governanceConfig: json('governance_config'),
  connectedAt: timestamp('connected_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
  revokedAt: timestamp('revoked_at'),
}, (t) => ({
  idxUser: index('idx_conn_user').on(t.userId, t.platform, t.status),
  idxOrg: index('idx_conn_org').on(t.orgId),
}));

export const ingestedTasks = mysqlTable('ingested_tasks', {
  id: bigint('id', { mode: 'number' }).notNull().autoincrement().primaryKey(),
  connectionId: char('connection_id', { length: 36 }).notNull(),
  userId: char('user_id', { length: 36 }).notNull(),
  platform: varchar('platform', { length: 32 }).notNull(),
  externalId: varchar('external_id', { length: 190 }).notNull(),
  name: varchar('name', { length: 512 }),
  description: mediumtext('description'),
  status: varchar('status', { length: 64 }),
  statusType: varchar('status_type', { length: 32 }),
  project: varchar('project', { length: 190 }),
  listName: varchar('list_name', { length: 190 }),
  spaceId: varchar('space_id', { length: 64 }),
  parentId: varchar('parent_id', { length: 190 }),
  subtaskCount: int('subtask_count').notNull().default(0),
  commentCount: int('comment_count').notNull().default(0),
  attachmentCount: int('attachment_count').notNull().default(0),
  assigneeCount: int('assignee_count').notNull().default(0),
  recurrence: tinyint('recurrence').notNull().default(0),
  dueDate: timestamp('due_date'),
  taskCreatedAt: timestamp('task_created_at'),
  taskUpdatedAt: timestamp('task_updated_at'),
  tags: json('tags'),
  checklist: json('checklist'),
  customFields: json('custom_fields'),
  assigneeRefs: json('assignee_refs'),
  redactionTypes: json('redaction_types'),
  comments: json('comments'),
  attachments: json('attachments'),
  relatedIds: json('related_ids'),
  statusHistory: json('status_history'),
  retentionExpiresAt: timestamp('retention_expires_at'),
  ingestedAt: timestamp('ingested_at').notNull().defaultNow(),
}, (t) => ({
  uniqConnTask: uniqueIndex('uniq_conn_task').on(t.connectionId, t.externalId),
  idxUser: index('idx_task_user').on(t.userId, t.platform),
  idxRetention: index('idx_task_retention').on(t.retentionExpiresAt),
}));

export const connectionOptouts = mysqlTable('connection_optouts', {
  connectionId: char('connection_id', { length: 36 }).notNull(),
  employeeRef: varchar('employee_ref', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.connectionId, t.employeeRef] }) }));

// Work Intelligence — Phase 2. Mirrors sql/task_discovery.sql.
export const taskDiscoverySessions = mysqlTable('task_discovery_sessions', {
  id: char('id', { length: 36 }).notNull().primaryKey(),
  userId: char('user_id', { length: 36 }).notNull(),
  connectionId: char('connection_id', { length: 36 }),
  platform: varchar('platform', { length: 32 }),
  externalTaskId: varchar('external_task_id', { length: 190 }),
  taskName: varchar('task_name', { length: 512 }),
  status: varchar('status', { length: 24 }).notNull().default('clarifying'),
  contextJson: json('context_json'),
  questionsJson: json('questions_json'),
  answersJson: json('answers_json'),
  blueprintId: char('blueprint_id', { length: 36 }),
  sessionId: char('session_id', { length: 36 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  idxUser: index('idx_disc_user').on(t.userId, t.status),
  idxTask: index('idx_disc_task').on(t.connectionId, t.externalTaskId),
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

// --- Lemon Squeezy subscriptions (mirrors sql/subscriptions.sql) ---
export const subscriptions = mysqlTable('subscriptions', {
  id: char('id', { length: 36 }).primaryKey(),
  userId: char('user_id', { length: 36 }),
  lsSubscriptionId: varchar('ls_subscription_id', { length: 64 }).notNull(),
  lsCustomerId: varchar('ls_customer_id', { length: 64 }),
  lsOrderId: varchar('ls_order_id', { length: 64 }),
  lsProductId: varchar('ls_product_id', { length: 64 }),
  lsVariantId: varchar('ls_variant_id', { length: 64 }),
  productName: varchar('product_name', { length: 190 }),
  variantName: varchar('variant_name', { length: 190 }),
  status: varchar('status', { length: 32 }),
  cardBrand: varchar('card_brand', { length: 32 }),
  cardLastFour: varchar('card_last_four', { length: 8 }),
  trialEndsAt: timestamp('trial_ends_at'),
  renewsAt: timestamp('renews_at'),
  endsAt: timestamp('ends_at'),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  customerPortalUrl: text('customer_portal_url'),
  updateUrl: text('update_url'),
  rawJson: json('raw_json'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  uniqLsSub: uniqueIndex('uniq_ls_subscription').on(t.lsSubscriptionId),
  idxUser: index('idx_sub_user').on(t.userId, t.status),
}));

// Re-exported for repositories that need raw SQL fragments.
export { sql };
