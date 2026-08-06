-- Governance & Compliance Scanner — persisted scan snapshots (Phase 5 finishing
-- touch, and the prerequisite for Phase 7 Remediation Loop's before/after
-- comparison). Each row is one immutable scan result tied to a Blueprint and
-- timestamped, so users get history and "improved since last scan" deltas
-- without re-running (a re-run of a changed Blueprint/workflow would otherwise
-- silently produce different numbers with nothing to compare against).
--
-- The full findings/report/framework payloads are snapshotted as JSON; the
-- headline metrics are denormalised into columns so history listing and
-- before/after comparison are cheap (no JSON parsing to rank two scans).
--
-- Privacy: findings/report never contain secret VALUES (only presence) — the
-- scanner redacts before emitting. Applied AFTER schema.sql by
-- scripts/migrate.js (tolerant mode).

CREATE TABLE IF NOT EXISTS governance_scans (
  id                   BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  blueprint_id         CHAR(36)      NOT NULL,
  user_id              CHAR(36)      NULL,               -- who ran it
  platform             VARCHAR(32)   NOT NULL DEFAULT 'n8n',
  workflow_name        VARCHAR(512)  NULL,
  node_count           INT           NOT NULL DEFAULT 0,
  version_count        INT           NOT NULL DEFAULT 0, -- Blueprint versions at scan time
  had_workflow         TINYINT(1)    NOT NULL DEFAULT 0, -- 0 → controls-only scan
  -- Denormalised headline metrics (for cheap history + comparison) --
  readiness_pct        INT           NOT NULL DEFAULT 0,
  readiness_band       VARCHAR(24)   NULL,
  security_risk_level  VARCHAR(16)   NULL,
  findings_total       INT           NOT NULL DEFAULT 0,
  worst_severity       VARCHAR(16)   NULL,
  manual_review_count  INT           NOT NULL DEFAULT 0,
  -- Full immutable snapshot --
  summary_json         JSON          NULL,
  findings_json        JSON          NULL,
  report_json          JSON          NULL,
  framework_json       JSON          NULL,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gov_scan_blueprint (blueprint_id, created_at DESC)
) ENGINE=InnoDB;
