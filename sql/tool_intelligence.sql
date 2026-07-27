-- Tool / API / MCP Intelligence (Task D) — the tool-knowledge layer that feeds
-- recommendation, cost, the Claude Code / MCP export packages, and workflow
-- generation. Pricing detail lives in connector_cost_profiles; this holds
-- everything else about a tool. Applied AFTER schema.sql (tolerant mode).

CREATE TABLE IF NOT EXISTS tool_intelligence (
  id                     CHAR(36)      NOT NULL PRIMARY KEY,
  tool_name              VARCHAR(190)  NOT NULL,          -- 'Slack', 'HubSpot', 'OpenAI'
  slug                   VARCHAR(96)   NULL,              -- 'slack' (matches workflow integrations)
  category               VARCHAR(48)   NULL,              -- crm, communication, ecommerce, ai, …
  -- API
  api_available          TINYINT(1)    NULL,
  api_base_url           VARCHAR(512)  NULL,
  documentation_url      VARCHAR(512)  NULL,
  auth_method            VARCHAR(32)   NOT NULL DEFAULT 'unknown',
                           -- api_key | oauth2 | oauth1 | basic | bearer | token | jwt | none | unknown
  auth_notes             TEXT          NULL,
  rate_limits            TEXT          NULL,              -- human notes (or JSON string)
  -- MCP
  mcp_available          TINYINT(1)    NULL,
  mcp_server             VARCHAR(190)  NULL,              -- MCP server name/identifier
  mcp_url                VARCHAR(512)  NULL,
  -- Pricing (summary; authoritative detail in connector_cost_profiles)
  pricing_model          VARCHAR(32)   NULL,
  pricing_url            VARCHAR(512)  NULL,
  -- Fit / risk
  use_cases              JSON          NULL,              -- ['CRM sync','Lead capture']
  integration_complexity VARCHAR(16)   NOT NULL DEFAULT 'unknown',  -- low|medium|high|unknown
  security_risk          VARCHAR(16)   NOT NULL DEFAULT 'unknown',  -- low|medium|high|unknown
  security_notes         TEXT          NULL,
  -- Workflow generation helpers
  n8n_node_type          VARCHAR(96)   NULL,              -- 'n8n-nodes-base.slack'
  -- Provenance
  confidence             VARCHAR(16)   NOT NULL DEFAULT 'unknown',
  last_checked_at        TIMESTAMP     NULL,
  created_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tool_name (tool_name),
  INDEX idx_tool_slug (slug),
  INDEX idx_tool_category (category)
) ENGINE=InnoDB;
