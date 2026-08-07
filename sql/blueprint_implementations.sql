-- AI Adoption Intelligence — Phase 3 (Implementation Tracking). Turns
-- "Implemented / Active / Measured" from INFERENCE into CONFIRMED facts: a user
-- or admin states a Blueprint's workflow is actually deployed, whether it's
-- currently running, and self-reports outcomes. One record per Blueprint.
-- Applied AFTER schema.sql by scripts/migrate.js (tolerant mode).

CREATE TABLE IF NOT EXISTS blueprint_implementations (
  blueprint_id      CHAR(36)      NOT NULL PRIMARY KEY,
  user_id           CHAR(36)      NOT NULL,   -- who confirmed it
  implemented       TINYINT(1)    NOT NULL DEFAULT 0,   -- 3.1 deployed at all
  active            TINYINT(1)    NOT NULL DEFAULT 0,   -- 3.2 currently running
  platform          VARCHAR(32)   NULL,       -- n8n | make | zapier | claude | custom
  deployed_at       DATE          NULL,       -- 3.1 deployment date
  owner             VARCHAR(160)  NULL,       -- 3.1 accountable owner (name/email)
  usage_volume      INT           NULL,       -- 3.3 self-reported runs / month
  time_saved_hours  INT           NULL,       -- 3.3 self-reported hours saved / month
  outcome_notes     VARCHAR(1000) NULL,       -- 3.3 free-text
  measured          TINYINT(1)    NOT NULL DEFAULT 0,   -- 3.3 outcomes reported → "Measured"
  implemented_at    TIMESTAMP     NULL,       -- when confirm-implemented was first done
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_impl_user (user_id),
  INDEX idx_impl_active (active)
) ENGINE=InnoDB;

-- Phase 4.4 — a per-run time-saved rate. Multiplied by MEASURED run volume
-- (execution_events) it yields a genuinely telemetry-derived hours-saved figure
-- that replaces the Phase-1 estimate once telemetry is connected. Tolerant
-- migration ignores the duplicate-column error on re-run.
ALTER TABLE blueprint_implementations ADD COLUMN minutes_saved_per_run INT NULL;
