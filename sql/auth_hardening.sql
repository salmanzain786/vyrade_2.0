-- Auth attempt log. Two jobs in one table:
--   1) audit trail for every authentication event (who/what/when/outcome), and
--   2) the source of truth for rate limiting (count rows in a rolling window),
--      which survives restarts and works across instances — unlike an
--      in-memory counter.
-- Applied by scripts/migrate.js in tolerant mode, so re-running is safe.

CREATE TABLE IF NOT EXISTS auth_attempts (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event       VARCHAR(32)  NOT NULL,  -- login|register|resend_otp|forgot_password|verify_email|verify_reset_otp|reset_password
  email       VARCHAR(190) NULL,
  ip          VARCHAR(45)  NULL,      -- 45 = max IPv6 length
  user_id     CHAR(36)     NULL,
  outcome     VARCHAR(16)  NOT NULL,  -- success | failure | blocked
  reason      VARCHAR(160) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Rate-limit lookups are always (key, event, time-window).
  INDEX idx_auth_attempts_email (email, event, created_at),
  INDEX idx_auth_attempts_ip (ip, event, created_at),
  INDEX idx_auth_attempts_time (created_at)
) ENGINE=InnoDB;
