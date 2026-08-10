-- Work Intelligence (Task-to-Automation) — Phase 1: Foundation.
-- Connection setup, scope/governance config, and privacy-safe task ingest.
-- Applied AFTER schema.sql by scripts/migrate.js (tolerant mode).

-- A connected task-management platform (OAuth). Tokens are stored ENCRYPTED
-- (AES-256-GCM, see tokenCrypto.js) — never plaintext. scope_config and
-- governance_config hold the consent/scope decisions from the setup screen.
CREATE TABLE IF NOT EXISTS platform_connections (
  id                   CHAR(36)      NOT NULL PRIMARY KEY,
  user_id              CHAR(36)      NOT NULL,   -- who connected it
  org_id               CHAR(36)      NULL,       -- their org, if any
  platform             VARCHAR(32)   NOT NULL,   -- clickup | asana | monday | jira | trello
  external_account_id  VARCHAR(190)  NULL,
  account_name         VARCHAR(190)  NULL,
  access_token_enc     VARCHAR(1024) NULL,       -- encrypted
  refresh_token_enc    VARCHAR(1024) NULL,       -- encrypted
  token_expires_at     TIMESTAMP     NULL,
  status               VARCHAR(16)   NOT NULL DEFAULT 'active',  -- active | revoked | expired
  scope_config         JSON          NULL,
  governance_config    JSON          NULL,
  connected_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  revoked_at           TIMESTAMP     NULL,
  INDEX idx_conn_user (user_id, platform, status),
  INDEX idx_conn_org (org_id)
) ENGINE=InnoDB;

-- Ingested tasks, normalized + REDACTED (secrets/emails stripped, assignees
-- hashed). retention_expires_at enforces the governance retention window.
CREATE TABLE IF NOT EXISTS ingested_tasks (
  id                   BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  connection_id        CHAR(36)      NOT NULL,
  user_id              CHAR(36)      NOT NULL,
  platform             VARCHAR(32)   NOT NULL,
  external_id          VARCHAR(190)  NOT NULL,
  name                 VARCHAR(512)  NULL,        -- redacted
  description          MEDIUMTEXT    NULL,        -- redacted
  status               VARCHAR(64)   NULL,
  status_type          VARCHAR(32)   NULL,
  project              VARCHAR(190)  NULL,
  list_name            VARCHAR(190)  NULL,
  space_id             VARCHAR(64)   NULL,
  parent_id            VARCHAR(190)  NULL,
  subtask_count        INT           NOT NULL DEFAULT 0,
  comment_count        INT           NOT NULL DEFAULT 0,
  attachment_count     INT           NOT NULL DEFAULT 0,
  assignee_count       INT           NOT NULL DEFAULT 0,
  recurrence           TINYINT(1)    NOT NULL DEFAULT 0,
  due_date             TIMESTAMP     NULL,
  task_created_at      TIMESTAMP     NULL,
  task_updated_at      TIMESTAMP     NULL,
  tags                 JSON          NULL,
  checklist            JSON          NULL,        -- redacted
  custom_fields        JSON          NULL,
  assignee_refs        JSON          NULL,        -- HASHED refs only
  redaction_types      JSON          NULL,
  retention_expires_at TIMESTAMP     NULL,
  ingested_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_conn_task (connection_id, external_id),
  INDEX idx_task_user (user_id, platform),
  INDEX idx_task_retention (retention_expires_at)
) ENGINE=InnoDB;

-- Phase 2.2 fuller context — captured ONLY when the org opts the field in
-- (scope.fields.comments / .attachments), so the conservative default footprint
-- is unchanged. Comments are redacted like all other text; attachments store
-- metadata/links only (never content). status_history accumulates observed
-- transitions across syncs. Tolerant migration ignores duplicate-column errors.
ALTER TABLE ingested_tasks ADD COLUMN comments JSON NULL;
ALTER TABLE ingested_tasks ADD COLUMN attachments JSON NULL;
ALTER TABLE ingested_tasks ADD COLUMN related_ids JSON NULL;
ALTER TABLE ingested_tasks ADD COLUMN status_history JSON NULL;

-- Employees who have opted out of having their tasks analysed (governance 1.4).
CREATE TABLE IF NOT EXISTS connection_optouts (
  connection_id  CHAR(36)     NOT NULL,
  employee_ref   VARCHAR(64)  NOT NULL,   -- HASHED
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (connection_id, employee_ref)
) ENGINE=InnoDB;
