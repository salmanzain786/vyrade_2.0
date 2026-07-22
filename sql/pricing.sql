-- Cost Intelligence — Phase 4: pricing source registry.
-- Applied AFTER schema.sql by scripts/migrate.js (tolerant mode).
--
-- Provenance for every price the cost engine may use. The governing rule lives
-- in code (lib/services/cost/pricingSources.js): ONLY official pricing/help
-- pages can yield a high-confidence price. A component with no source resolves
-- to { price: null, confidence: 'unknown' } — never a hallucinated number.

CREATE TABLE IF NOT EXISTS pricing_sources (
  id                 CHAR(36)     NOT NULL PRIMARY KEY,
  provider           VARCHAR(64)  NOT NULL,               -- 'zapier','make','n8n','openai','hubspot',…
  component_type     VARCHAR(64)  NOT NULL,               -- 'platform_task_usage','llm_tokens','tool_subscription',…
  pricing_url        VARCHAR(512) NULL,
  source_type        VARCHAR(32)  NOT NULL DEFAULT 'unknown',
                       -- official_pricing_page | official_help_doc | api_docs |
                       -- manual_entry | user_provided | inferred | unknown
  extraction_method  VARCHAR(32)  NOT NULL DEFAULT 'manual',  -- manual | scrape | api | llm_parsed
  confidence         VARCHAR(16)  NOT NULL DEFAULT 'unknown', -- high | medium | low | unknown
  raw_snapshot       MEDIUMTEXT   NULL,                    -- raw fetched page/text (audit trail)
  parsed_json        JSON         NULL,                    -- normalized parsed pricing payload
  notes              TEXT         NULL,
  last_checked_at    TIMESTAMP    NULL,                    -- when the source was last re-verified
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,
  -- One row per (provider, component, source_type): an official page AND a
  -- manual entry can coexist, but the same source_type isn't duplicated.
  UNIQUE KEY uq_pricing_source (provider, component_type, source_type),
  INDEX idx_pricing_lookup (provider, component_type)
) ENGINE=InnoDB;
