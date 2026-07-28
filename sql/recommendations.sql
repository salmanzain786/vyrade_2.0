-- Recommendation persistence (Task 3 DoD) — "Recommendation result is stored
-- with timestamp and input version." An append-only audit log of each distinct
-- recommendation the engine produced, so later exports can reference which
-- recommendation they followed. Applied AFTER schema.sql (tolerant mode).

CREATE TABLE IF NOT EXISTS recommendation_runs (
  id                   CHAR(36)     NOT NULL PRIMARY KEY,
  blueprint_id         CHAR(36)     NOT NULL,
  blueprint_version    INT          NOT NULL,          -- the input version scored
  user_id              CHAR(36)     NULL,
  recommended_platform VARCHAR(48)  NULL,              -- quick access / indexing
  confidence           VARCHAR(16)  NULL,
  engine_version       VARCHAR(32)  NOT NULL DEFAULT 'rules-v1',
  monthly_runs         INT          NULL,              -- volume override input (part of "input version")
  recommendation_hash  CHAR(64)     NULL,              -- sha256 of the FULL normalized recommendation + input
  recommendation_json  JSON         NOT NULL,          -- the full recommendation
  generated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rec_latest (blueprint_id, blueprint_version, created_at),
  INDEX idx_rec_hash (blueprint_id, blueprint_version, recommendation_hash),
  INDEX idx_rec_blueprint (blueprint_id)
) ENGINE=InnoDB;

-- Add the content hash to an already-created table (tolerant migration ignores
-- "duplicate column" when it already exists from the CREATE above).
ALTER TABLE recommendation_runs ADD COLUMN recommendation_hash CHAR(64) NULL AFTER monthly_runs;
CREATE INDEX idx_rec_hash ON recommendation_runs (blueprint_id, blueprint_version, recommendation_hash);
