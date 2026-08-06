-- Remediation Loop — per-finding resolution tracking (Phase 7.2). Lets an owner
-- mark an individual finding as in-progress / resolved / accepted-risk, tied to
-- the Blueprint. Keyed by finding identity (type + node) so the status survives
-- re-scans: a finding that reappears after being marked "resolved" is a
-- regression (surfaced in the reassessment view). Applied AFTER schema.sql by
-- scripts/migrate.js (tolerant mode).

CREATE TABLE IF NOT EXISTS finding_resolutions (
  blueprint_id  CHAR(36)      NOT NULL,
  finding_key   VARCHAR(255)  NOT NULL,   -- `${type}::${node||''}`
  finding_type  VARCHAR(64)   NOT NULL,
  node          VARCHAR(255)  NULL,
  status        VARCHAR(24)   NOT NULL DEFAULT 'open',  -- open | in_progress | resolved | accepted_risk
  note          VARCHAR(1000) NULL,
  updated_by    CHAR(36)      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (blueprint_id, finding_key)
) ENGINE=InnoDB;
