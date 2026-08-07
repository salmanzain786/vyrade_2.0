-- AI Adoption Intelligence — Phase 1 (Profile + Blueprint Intelligence).
-- Single-user layer; NO org/multi-tenant model (that's Phase 2). Builds on the
-- existing users + Blueprint model. Applied AFTER schema.sql by
-- scripts/migrate.js (tolerant mode).

-- 1.1 — Progressive profile. Contextual capture (minimum first, rest later), so
-- every field is nullable; `completed` marks when the user finished the profile.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id               CHAR(36)     NOT NULL PRIMARY KEY,
  role                  VARCHAR(96)  NULL,
  job_title             VARCHAR(160) NULL,
  department            VARCHAR(96)  NULL,   -- catalog key (marketing/finance/support/…)
  industry              VARCHAR(96)  NULL,
  company_size          VARCHAR(32)  NULL,   -- solo | small | mid | large | enterprise
  technical_skill       VARCHAR(24)  NULL,   -- no_code | low_code | technical | developer
  responsibilities      JSON         NULL,   -- string[]
  current_ai_tools      JSON         NULL,   -- string[]
  automation_platforms  JSON         NULL,   -- string[]
  bottlenecks           JSON         NULL,   -- string[]
  completed             TINYINT(1)   NOT NULL DEFAULT 0,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 1.2 — Personalised opportunity map (seeded from a curated role/department →
-- workflow-area catalog; per user, per area, with a lifecycle status).
CREATE TABLE IF NOT EXISTS opportunity_map (
  user_id          CHAR(36)     NOT NULL,
  area_key         VARCHAR(64)  NOT NULL,
  label            VARCHAR(160) NOT NULL,
  department       VARCHAR(96)  NULL,
  est_hours_month  INT          NULL,        -- ESTIMATED (labelled as such until Phase 4)
  complexity       VARCHAR(16)  NULL,        -- no_code | low_code | api
  status           VARCHAR(24)  NOT NULL DEFAULT 'suggested',
                     -- suggested | discovered | considered | in_progress | addressed | dismissed
  blueprint_id     CHAR(36)     NULL,        -- the Blueprint that addresses it, once linked
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, area_key),
  INDEX idx_opp_user_status (user_id, status)
) ENGINE=InnoDB;

-- 1.3 — Progression-stage events (the 9-stage taxonomy). Same append-only,
-- best-effort pattern as operational_events, but a separate table (user-journey
-- events, not ops/failure telemetry). One row per stage transition.
CREATE TABLE IF NOT EXISTS adoption_events (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       CHAR(36)     NOT NULL,
  stage         VARCHAR(32)  NOT NULL,
                  -- discovered | considered | blueprint_started | blueprint_complete |
                  -- architecture_selected | implementation_prepared | implemented |
                  -- active | measured
  blueprint_id  CHAR(36)     NULL,
  area_key      VARCHAR(64)  NULL,
  metadata      JSON         NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_adoption_user (user_id, created_at),
  INDEX idx_adoption_stage (stage),
  INDEX idx_adoption_user_stage (user_id, stage)
) ENGINE=InnoDB;
