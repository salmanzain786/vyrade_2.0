-- Workflow Encyclopedia (Task C) — curated, categorized, quality-scored,
-- de-duplicated view over the raw workflow DB. Populated by
-- `npm run curate:workflows` (scripts/curate-workflows.mjs). Applied AFTER
-- schema.sql by scripts/migrate.js (tolerant mode).

CREATE TABLE IF NOT EXISTS workflow_encyclopedia (
  source_id          INT           NOT NULL PRIMARY KEY,   -- n8n_node_workflows.ID
  platform           VARCHAR(32)   NOT NULL DEFAULT 'n8n',
  name               VARCHAR(512)  NULL,
  description        TEXT          NULL,
  fingerprint        VARCHAR(32)   NOT NULL,               -- structural hash (dedup)
  category           VARCHAR(48)   NOT NULL,
  category_label     VARCHAR(96)   NULL,
  categories         JSON          NULL,                   -- all matched categories
  tags               JSON          NULL,
  integrations       JSON          NULL,                   -- apps used
  integration_count  INT           NOT NULL DEFAULT 0,
  trigger_type       VARCHAR(24)   NULL,
  complexity         VARCHAR(16)   NULL,
  node_count         INT           NOT NULL DEFAULT 0,
  quality_score      INT           NOT NULL DEFAULT 0,
  quality_tier       VARCHAR(16)   NULL,
  is_low_quality     TINYINT(1)    NOT NULL DEFAULT 0,
  is_canonical       TINYINT(1)    NOT NULL DEFAULT 1,     -- 0 → a duplicate
  duplicate_of       INT           NULL,                   -- canonical source_id
  blueprint_pattern  JSON          NULL,                   -- for Blueprint matching
  curated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,
  -- The primary page query: canonical, good-quality workflows in a category,
  -- ranked by quality.
  INDEX idx_enc_browse (platform, category, is_canonical, is_low_quality, quality_score),
  INDEX idx_enc_top (platform, is_canonical, is_low_quality, quality_score),
  INDEX idx_enc_fingerprint (fingerprint)
) ENGINE=InnoDB;
