-- Automation Blueprint storage — Section 15 of the spec.
-- Design: immutable version table + a pointer (current_version) on the
-- parent row. blueprint_json is stored as JSON; a versioned application
-- schema (enforced in Node, not MySQL) validates it before it ever reaches
-- this table.

CREATE TABLE IF NOT EXISTS automation_blueprints (
  id                 CHAR(36)     NOT NULL PRIMARY KEY,
  session_id         CHAR(36)     NOT NULL,
  current_version    INT          NOT NULL DEFAULT 0,
  status             VARCHAR(32)  NOT NULL DEFAULT 'collecting_requirements',
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_session (session_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS automation_blueprint_versions (
  id                 CHAR(36)     NOT NULL PRIMARY KEY,
  blueprint_id       CHAR(36)     NOT NULL,
  version            INT          NOT NULL,
  schema_version     VARCHAR(16)  NOT NULL DEFAULT '1.0',
  blueprint_json     JSON         NOT NULL,
  readiness_json     JSON         NULL,
  change_reason      TEXT         NULL,
  source_turn_id     VARCHAR(64)  NULL,
  created_by         VARCHAR(16)  NOT NULL, -- ai | user_edit | system | admin
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_blueprint_version (blueprint_id, version),
  INDEX idx_blueprint_version_desc (blueprint_id, version DESC),
  CONSTRAINT fk_blueprint
    FOREIGN KEY (blueprint_id) REFERENCES automation_blueprints(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Conversation persistence — stores the clarification chat so history can be
-- listed in the sidebar and a past session reopened. Keyed by the client's
-- session_id (same id used on automation_blueprints.session_id).
CREATE TABLE IF NOT EXISTS conversations (
  session_id         CHAR(36)     NOT NULL PRIMARY KEY,
  title              VARCHAR(200) NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_messages (
  seq                BIGINT       NOT NULL AUTO_INCREMENT,
  id                 CHAR(36)     NOT NULL,
  session_id         CHAR(36)     NOT NULL,
  role               VARCHAR(16)  NOT NULL, -- user | agent | system
  content            TEXT         NOT NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (seq),
  UNIQUE KEY uniq_message_id (id),
  INDEX idx_conversation_messages (session_id, seq)
) ENGINE=InnoDB;

-- Generated workflow output (Section 24). Each generation is stored against the
-- Blueprint id + version it was produced from, so the latest downloadable
-- workflow survives page reloads and history reopens.
CREATE TABLE IF NOT EXISTS blueprint_workflows (
  seq                BIGINT       NOT NULL AUTO_INCREMENT,
  id                 CHAR(36)     NOT NULL,
  blueprint_id       CHAR(36)     NOT NULL,
  blueprint_version  INT          NOT NULL,
  target             VARCHAR(32)  NOT NULL DEFAULT 'n8n',
  workflow_json      JSON         NOT NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (seq),
  UNIQUE KEY uniq_workflow_id (id),
  INDEX idx_blueprint_workflows (blueprint_id, seq DESC)
) ENGINE=InnoDB;

-- Optional: lightweight event log for observability (Section 28).
-- Not required for core function, but makes "conversation -> blueprint
-- version -> downstream job" traceable.
CREATE TABLE IF NOT EXISTS automation_blueprint_events (
  id                 CHAR(36)     NOT NULL PRIMARY KEY,
  blueprint_id       CHAR(36)     NOT NULL,
  blueprint_version  INT          NOT NULL,
  event_type         VARCHAR(32)  NOT NULL, -- blueprint.created|updated|completed|blocked|archived
  payload_json       JSON         NULL,
  occurred_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_blueprint_events (blueprint_id, occurred_at)
) ENGINE=InnoDB;
