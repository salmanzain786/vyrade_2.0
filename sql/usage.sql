-- Token-usage + cost accounting. Applied AFTER schema.sql / auth.sql by
-- scripts/migrate.js (tolerant mode — re-running ignores "duplicate column").

-- Per-message LLM usage. A message that involved a model call (the agent's
-- clarification answer, a "workflow generated" system note) carries the tokens
-- and computed USD cost of producing it; user/plain-system messages stay at 0.
ALTER TABLE conversation_messages
  ADD COLUMN model             VARCHAR(64)    NULL AFTER content;
ALTER TABLE conversation_messages
  ADD COLUMN prompt_tokens     INT            NOT NULL DEFAULT 0 AFTER model;
ALTER TABLE conversation_messages
  ADD COLUMN completion_tokens INT            NOT NULL DEFAULT 0 AFTER prompt_tokens;
ALTER TABLE conversation_messages
  ADD COLUMN total_tokens      INT            NOT NULL DEFAULT 0 AFTER completion_tokens;
ALTER TABLE conversation_messages
  ADD COLUMN cost_usd          DECIMAL(12,6)  NOT NULL DEFAULT 0 AFTER total_tokens;

-- Running per-conversation totals (the "charge of each conversation"). Kept as a
-- denormalized sum so the sidebar / billing can read it without scanning
-- messages. Every LLM call for the session increments these.
ALTER TABLE conversations
  ADD COLUMN total_tokens   BIGINT        NOT NULL DEFAULT 0 AFTER title;
ALTER TABLE conversations
  ADD COLUMN total_cost_usd DECIMAL(14,6) NOT NULL DEFAULT 0 AFTER total_tokens;
