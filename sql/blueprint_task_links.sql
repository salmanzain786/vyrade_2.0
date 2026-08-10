-- Work Intelligence — Phase 4: Automation Project Synchronisation (write-back).
-- The bidirectional link between a task-sourced Blueprint and its originating
-- task, plus the last synced lifecycle stage. Applied AFTER schema.sql by
-- scripts/migrate.js (tolerant mode).

CREATE TABLE IF NOT EXISTS blueprint_task_links (
  blueprint_id       CHAR(36)      NOT NULL PRIMARY KEY,
  user_id            CHAR(36)      NOT NULL,
  connection_id      CHAR(36)      NULL,
  platform           VARCHAR(32)   NULL,
  external_task_id   VARCHAR(190)  NULL,
  task_url           VARCHAR(512)  NULL,       -- link back to the task (Blueprint→task)
  external_sync_ref  VARCHAR(190)  NULL,       -- id of the created comment/artifact on the platform
  last_stage         VARCHAR(48)   NULL,       -- last lifecycle stage written back
  last_synced_at     TIMESTAMP     NULL,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_link_task (connection_id, external_task_id),
  INDEX idx_link_user (user_id)
) ENGINE=InnoDB;
