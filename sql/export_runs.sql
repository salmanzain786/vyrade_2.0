-- Export provenance (architecture-first enforcement). Every workflow
-- generation / export is stamped with the recommendation it followed, so the
-- product promise — recommend BEFORE build — is auditable, and we can see how
-- often users build off-recommendation. Applied AFTER schema.sql (tolerant).

CREATE TABLE IF NOT EXISTS export_runs (
  id                     CHAR(36)     NOT NULL PRIMARY KEY,
  blueprint_id           CHAR(36)     NOT NULL,
  blueprint_version      INT          NOT NULL,
  user_id                CHAR(36)     NULL,
  selected_platform      VARCHAR(32)  NOT NULL,       -- n8n | make | zapier | claude
  kind                   VARCHAR(16)  NULL,           -- workflow | package | guide
  recommendation_id       CHAR(36)     NULL,           -- the recommendation this build followed
  recommended_platform    VARCHAR(48)  NULL,           -- what was recommended
  followed_recommendation TINYINT(1)   NULL,           -- selected matches recommended?
  is_recommendation_override TINYINT(1) NULL,          -- user built something OTHER than recommended
  override_reason         VARCHAR(48)  NULL,           -- e.g. user_selected_platform
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_export_blueprint (blueprint_id, created_at),
  INDEX idx_export_recommendation (recommendation_id),
  INDEX idx_export_override (is_recommendation_override, created_at)
) ENGINE=InnoDB;

-- Add the override columns to an already-created table (tolerant migration
-- ignores "duplicate column" when they already exist from the CREATE above).
ALTER TABLE export_runs ADD COLUMN is_recommendation_override TINYINT(1) NULL AFTER followed_recommendation;
ALTER TABLE export_runs ADD COLUMN override_reason VARCHAR(48) NULL AFTER is_recommendation_override;
-- Add the override index to an already-created table (tolerant migration
-- ignores ER_DUP_KEYNAME when it already exists from the CREATE above).
CREATE INDEX idx_export_override ON export_runs (is_recommendation_override, created_at);
