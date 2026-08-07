-- AI Adoption Intelligence — Phase 4 (Execution Telemetry). Real per-run data
-- from the automation platform (n8n first; Make/Zapier are fast-follows on the
-- SAME ingestion contract). This is what converts Phase 1's ESTIMATES into
-- MEASURED values.
--
-- PRIVACY: we store coarse, non-sensitive facts only — status, duration, a
-- COARSE error category (never raw messages), and an intervention flag. No
-- payloads, no PII. Same discipline as operational_events.
--
-- Applied AFTER schema.sql by scripts/migrate.js (tolerant mode).

-- Per-user ingestion tokens so a platform instance can authenticate to the
-- ingest endpoint without a user session.
CREATE TABLE IF NOT EXISTS telemetry_tokens (
  token         CHAR(64)     NOT NULL PRIMARY KEY,
  user_id       CHAR(36)     NOT NULL,
  label         VARCHAR(96)  NULL,
  revoked       TINYINT(1)   NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMP    NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tok_user (user_id, revoked)
) ENGINE=InnoDB;

-- Append-only execution events. One row per workflow run reported by a platform.
CREATE TABLE IF NOT EXISTS execution_events (
  id                    BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  blueprint_id          CHAR(36)     NULL,     -- resolved Vyrade Blueprint (if known)
  user_id               CHAR(36)     NOT NULL, -- owner (from the ingestion token)
  platform              VARCHAR(32)  NOT NULL DEFAULT 'n8n',
  external_workflow_id  VARCHAR(190) NULL,     -- the platform's own workflow id/name
  status                VARCHAR(16)  NOT NULL, -- success | error | waiting
  duration_ms           INT          NULL,
  error_category        VARCHAR(48)  NULL,     -- coarse category, never a raw message
  human_intervention    TINYINT(1)   NOT NULL DEFAULT 0,
  occurred_at           TIMESTAMP    NULL,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_exec_bp (blueprint_id, occurred_at),
  INDEX idx_exec_user (user_id, occurred_at),
  INDEX idx_exec_status (status)
) ENGINE=InnoDB;
