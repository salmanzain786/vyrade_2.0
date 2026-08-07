-- AI Adoption Intelligence — Phase 2 (Organisational Dashboard). Multi-tenancy.
--
-- DESIGN: additive & non-breaking. Blueprints remain USER-owned exactly as
-- before (automation_blueprints.user_id is untouched); the org layer only
-- AGGREGATES over members' data and gates new org views by role. No existing
-- ownership/permission check changes. A user belongs to at most one org
-- (single-org per user for this phase). Applied AFTER schema.sql by
-- scripts/migrate.js (tolerant mode).

CREATE TABLE IF NOT EXISTS organizations (
  id             CHAR(36)     NOT NULL PRIMARY KEY,
  name           VARCHAR(160) NOT NULL,
  owner_user_id  CHAR(36)     NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_org_owner (owner_user_id)
) ENGINE=InnoDB;

-- The org's department roster (keys align with the Phase 1 opportunity catalog).
CREATE TABLE IF NOT EXISTS departments (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  org_id      CHAR(36)     NOT NULL,
  `key`       VARCHAR(64)  NOT NULL,   -- catalog department key (marketing/finance/…)
  label       VARCHAR(96)  NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_org_dept (org_id, `key`),
  INDEX idx_dept_org (org_id)
) ENGINE=InnoDB;

-- Membership = the user↔org link + their org role + department.
-- Roles: owner | admin | manager | member  (access scope derives from this).
CREATE TABLE IF NOT EXISTS org_members (
  org_id      CHAR(36)     NOT NULL,
  user_id     CHAR(36)     NOT NULL,
  role        VARCHAR(16)  NOT NULL DEFAULT 'member',
  department  VARCHAR(64)  NULL,       -- catalog department key
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, user_id),
  INDEX idx_member_user (user_id),
  INDEX idx_member_dept (org_id, department)
) ENGINE=InnoDB;

-- Invite-by-email. Accepting adds an org_members row.
CREATE TABLE IF NOT EXISTS org_invitations (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  org_id      CHAR(36)     NOT NULL,
  email       VARCHAR(190) NOT NULL,
  role        VARCHAR(16)  NOT NULL DEFAULT 'member',
  department  VARCHAR(64)  NULL,
  token       CHAR(64)     NOT NULL,   -- random accept token
  status      VARCHAR(16)  NOT NULL DEFAULT 'pending',  -- pending | accepted | revoked
  invited_by  CHAR(36)     NULL,
  expires_at  TIMESTAMP    NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_org_invite_token (token),
  INDEX idx_inv_org (org_id, status),
  INDEX idx_inv_email (email)
) ENGINE=InnoDB;
