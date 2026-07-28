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
  recommendation_id      CHAR(36)     NULL,           -- the recommendation this build followed
  recommended_platform   VARCHAR(48)  NULL,           -- what was recommended
  followed_recommendation TINYINT(1)  NULL,           -- selected matches recommended?
  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_export_blueprint (blueprint_id, created_at),
  INDEX idx_export_recommendation (recommendation_id)
) ENGINE=InnoDB;
