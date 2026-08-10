-- Work Intelligence — Phase 2: Employee-Initiated Automation Discovery.
-- One task → focused clarification → a draft Blueprint (via the EXISTING
-- generation engine). Applied AFTER schema.sql by scripts/migrate.js (tolerant).

CREATE TABLE IF NOT EXISTS task_discovery_sessions (
  id                CHAR(36)      NOT NULL PRIMARY KEY,
  user_id           CHAR(36)      NOT NULL,
  connection_id     CHAR(36)      NULL,
  platform          VARCHAR(32)   NULL,
  external_task_id  VARCHAR(190)  NULL,
  task_name         VARCHAR(512)  NULL,       -- redacted snapshot
  status            VARCHAR(24)   NOT NULL DEFAULT 'clarifying',  -- clarifying | ready | blueprint_created
  context_json      JSON          NULL,       -- built task context (already redacted)
  questions_json    JSON          NULL,       -- generated clarification questions
  answers_json      JSON          NULL,       -- employee answers
  blueprint_id      CHAR(36)      NULL,       -- the draft Blueprint produced
  session_id        CHAR(36)      NULL,       -- chat session the Blueprint lives in
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_disc_user (user_id, status),
  INDEX idx_disc_task (connection_id, external_task_id)
) ENGINE=InnoDB;
