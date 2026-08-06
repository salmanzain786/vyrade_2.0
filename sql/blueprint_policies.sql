-- Governance & Policy Requirements (Phase 6.1) — the human-authored "contract"
-- a workflow is checked against. Stored SEPARATELY from automation_blueprints /
-- automation_blueprint_versions on purpose: the Blueprint JSON is AI-generated
-- and re-versioned, and must never clobber an approved policy. One current
-- policy per Blueprint (edit-in-place). Verified against real data that the
-- Blueprint's own policy-slot fields (prohibited_platforms, required_platforms,
-- self_hosting_required, security/compliance_requirements, approval_points) are
-- 0% populated, so this is a genuine addition, not a duplicate.
--
-- Applied AFTER schema.sql by scripts/migrate.js (tolerant mode).

CREATE TABLE IF NOT EXISTS blueprint_policies (
  blueprint_id   CHAR(36)     NOT NULL PRIMARY KEY,
  policy_json    JSON         NOT NULL,        -- normalised policy (see lib/services/scanner/policy.js)
  enabled        TINYINT(1)   NOT NULL DEFAULT 0,  -- mirror of policy_json.enabled for cheap filtering
  authored_by    CHAR(36)     NULL,            -- user who last edited it
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
