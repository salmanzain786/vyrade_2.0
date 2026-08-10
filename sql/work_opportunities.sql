-- Work Intelligence — Phase 3: Organisation-wide Opportunity Discovery.
--
-- DECISION (plan open question): task-sourced opportunities use a SEPARATE table,
-- not the adoption `opportunity_map` (which is per-user, keyed by a curated
-- catalog area). These are a different grain — org-level PATTERNS detected across
-- many tasks/employees, carrying task EVIDENCE. We keep the shared opportunity
-- VOCABULARY (status lifecycle) but not one table. Applied AFTER schema.sql by
-- scripts/migrate.js (tolerant mode).

CREATE TABLE IF NOT EXISTS work_opportunities (
  id               CHAR(36)      NOT NULL PRIMARY KEY,
  user_id          CHAR(36)      NOT NULL,   -- who ran the analysis (owner)
  org_id           CHAR(36)      NULL,
  connection_id    CHAR(36)      NULL,
  title            VARCHAR(255)  NOT NULL,   -- e.g. "Monthly reporting across 14 projects"
  `signal`         VARCHAR(48)   NOT NULL,   -- repeated_name | recurring | copied_across_projects | consistent_checklist | approval_bottleneck | reopened | handoff (backticked: reserved word)
  pattern_key      VARCHAR(190)  NULL,       -- normalized grouping key (dedupe / upsert)
  task_count       INT           NOT NULL DEFAULT 0,
  project_count    INT           NOT NULL DEFAULT 0,
  people_count     INT           NOT NULL DEFAULT 0,
  department       VARCHAR(96)   NULL,
  est_hours_month  INT           NULL,       -- ESTIMATED (labelled until Phase-4-style telemetry)
  evidence         JSON          NULL,       -- { task_ids, projects, examples }
  status           VARCHAR(24)   NOT NULL DEFAULT 'suggested',
                     -- suggested | reviewing | accepted | dismissed | blueprint_created
  blueprint_id     CHAR(36)      NULL,
  discovery_id     CHAR(36)      NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_opp (connection_id, `signal`, pattern_key),
  INDEX idx_opp_user (user_id, status),
  INDEX idx_opp_org (org_id, status)
) ENGINE=InnoDB;
