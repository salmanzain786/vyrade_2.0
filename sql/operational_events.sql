-- Operational Insights Engine (Task E) — Vyrade's learning loop.
-- An append-only event log of what actually happens during generation/import,
-- so the system can learn from real workflows: which nodes fail, which tools
-- have doc gaps, repair rates, import failures, token usage. Applied AFTER
-- schema.sql by scripts/migrate.js (tolerant mode).
--
-- Privacy: stores categories/types/ids and numbers only — never raw errors,
-- Blueprint text, workflow JSON, emails, or credentials.

CREATE TABLE IF NOT EXISTS operational_events (
  id             BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_type     VARCHAR(48)   NOT NULL,
                   -- workflow_generated | import_failed | import_skipped |
                   -- repair_performed | doc_gap | generation_failed |
                   -- export_failed | regenerated
  platform       VARCHAR(32)   NULL,
  blueprint_id   CHAR(36)      NULL,
  user_id        CHAR(36)      NULL,
  node_type      VARCHAR(96)   NULL,   -- offending / related node type
  tool           VARCHAR(96)   NULL,   -- related tool / system (doc gaps, timeouts)
  error_category VARCHAR(48)   NULL,   -- coarse category, never a raw message
  severity       VARCHAR(16)   NOT NULL DEFAULT 'info',   -- info | warning | error
  tokens         INT           NULL,
  cost_usd       DECIMAL(12,6) NULL,
  metric         INT           NULL,   -- generic count (repair count, node count, duration ms)
  metadata       JSON          NULL,   -- extra structured, non-sensitive detail
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ops_type_time (event_type, created_at),
  INDEX idx_ops_node (node_type, created_at),
  INDEX idx_ops_tool (tool, created_at),
  INDEX idx_ops_blueprint (blueprint_id)
) ENGINE=InnoDB;
