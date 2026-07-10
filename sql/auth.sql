-- Authentication schema — users, one-time passcodes (OTP), and ownership links.
-- Applied by scripts/migrate.js AFTER schema.sql. Every statement here is
-- idempotent-by-tolerance: the migrator ignores "duplicate column / key"
-- errors so re-running is safe even on MySQL versions without
-- ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(190) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  email_verified  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_users_email (email)
) ENGINE=InnoDB;

-- Short-lived one-time codes for email verification and password reset.
-- The code itself is never stored — only a SHA-256 hash. Purpose scopes a code
-- to a single flow so a verification code can't be replayed as a reset code.
CREATE TABLE IF NOT EXISTS auth_otps (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  user_id      CHAR(36)     NOT NULL,
  purpose      VARCHAR(32)  NOT NULL, -- email_verification | password_reset
  code_hash    CHAR(64)     NOT NULL,
  expires_at   TIMESTAMP    NOT NULL,
  attempts     INT          NOT NULL DEFAULT 0,
  consumed_at  TIMESTAMP    NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_otps_lookup (user_id, purpose),
  CONSTRAINT fk_auth_otps_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Ownership: every conversation and blueprint belongs to a user. NULL is only
-- possible for pre-auth rows created before this migration.
ALTER TABLE conversations
  ADD COLUMN user_id CHAR(36) NULL AFTER session_id;
ALTER TABLE conversations
  ADD INDEX idx_conversations_user (user_id);

ALTER TABLE automation_blueprints
  ADD COLUMN user_id CHAR(36) NULL AFTER session_id;
ALTER TABLE automation_blueprints
  ADD INDEX idx_blueprints_user (user_id);
