-- Lemon Squeezy subscriptions. Populated by the webhook (source of truth), and
-- read by the /purchase page to decide Buy-Now vs. Manage. Applied AFTER
-- schema.sql / auth.sql by scripts/migrate.js (tolerant mode).

CREATE TABLE IF NOT EXISTS subscriptions (
  id                    CHAR(36)     NOT NULL PRIMARY KEY,
  user_id               CHAR(36)     NULL,               -- linked via checkout custom_data
  ls_subscription_id    VARCHAR(64)  NOT NULL,           -- Lemon Squeezy subscription id
  ls_customer_id        VARCHAR(64)  NULL,
  ls_order_id           VARCHAR(64)  NULL,
  ls_product_id         VARCHAR(64)  NULL,
  ls_variant_id         VARCHAR(64)  NULL,
  product_name          VARCHAR(190) NULL,
  variant_name          VARCHAR(190) NULL,
  status                VARCHAR(32)  NULL,               -- active | on_trial | past_due | cancelled | expired | paused | unpaid
  card_brand            VARCHAR(32)  NULL,
  card_last_four        VARCHAR(8)   NULL,
  trial_ends_at         TIMESTAMP    NULL,
  renews_at             TIMESTAMP    NULL,               -- next renewal = current period end
  ends_at               TIMESTAMP    NULL,               -- set when cancelled/expired
  current_period_start  TIMESTAMP    NULL,
  current_period_end    TIMESTAMP    NULL,
  customer_portal_url   TEXT         NULL,               -- LS self-service portal
  update_url            TEXT         NULL,               -- LS update-subscription / payment url
  raw_json              JSON         NULL,               -- full last payload (other necessary data)
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ls_subscription (ls_subscription_id),
  INDEX idx_sub_user (user_id, status),
  INDEX idx_sub_status (status)
) ENGINE=InnoDB;
