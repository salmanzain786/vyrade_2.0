-- Cost Intelligence — Phase 5: tool/API pricing profiles.
-- Applied AFTER schema.sql by scripts/migrate.js (tolerant mode).
--
-- Per-connector pricing for the external systems a workflow touches (the
-- "External API / tool cost" category). Same honesty rule as the rest of the
-- engine: unit_price stays NULL until a real price is known — never guessed.
-- Provenance for those prices lives in pricing_sources (Phase 4).

CREATE TABLE IF NOT EXISTS connector_cost_profiles (
  id                   CHAR(36)      NOT NULL PRIMARY KEY,
  connector_id         VARCHAR(128)  NULL,             -- platform connector id (n8n node type, zapier app slug, …)
  connector_name       VARCHAR(190)  NOT NULL,         -- 'Email Validation API', 'Slack', …
  platform             VARCHAR(32)   NULL,             -- n8n|make|zapier|claude, or NULL = platform-agnostic
  system_name          VARCHAR(190)  NULL,             -- maps to Blueprint systems[].name
  pricing_model        VARCHAR(32)   NOT NULL DEFAULT 'unknown',
                         -- per_api_call | workspace_plan | subscription | per_seat |
                         -- tiered | usage_based | free | unknown
  pricing_url          VARCHAR(512)  NULL,
  free_tier_available  TINYINT(1)    NULL,
  requires_paid_plan   TINYINT(1)    NULL,
  unit_name            VARCHAR(64)   NULL,             -- 'validation','message','row', …
  unit_price           DECIMAL(12,6) NULL,             -- NULL until a real price is known
  included_units       INT           NULL,             -- units bundled before overage applies
  overage_price        DECIMAL(12,6) NULL,             -- per-unit cost beyond included_units
  rate_limit_notes     TEXT          NULL,
  confidence           VARCHAR(16)   NOT NULL DEFAULT 'unknown',  -- high|medium|low|unknown
  notes                TEXT          NULL,
  last_checked_at      TIMESTAMP     NULL,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,
  -- One profile per (connector_name, platform); a platform-specific profile and
  -- a platform-agnostic (NULL) one can coexist.
  UNIQUE KEY uq_connector_profile (connector_name, platform),
  INDEX idx_connector_system (system_name),
  INDEX idx_connector_name (connector_name)
) ENGINE=InnoDB;
