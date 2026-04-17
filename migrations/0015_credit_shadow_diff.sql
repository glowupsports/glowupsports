-- Phase 2 — Credit shadow-mode diff log.
-- Idempotent. Records every divergence between the legacy credit hot path
-- and the new credit-engine V2 so we can review before flipping
-- `academies.use_new_credit_system`.
CREATE TABLE IF NOT EXISTS credit_shadow_diff (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id          VARCHAR NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  player_id           VARCHAR NOT NULL REFERENCES players(id)   ON DELETE CASCADE,
  scope               TEXT    NOT NULL, -- consume | refund | balance
  session_player_id   VARCHAR,
  session_id          VARCHAR,
  type                TEXT,             -- group | semi_private | private
  legacy_value        JSONB   NOT NULL,
  new_value           JSONB   NOT NULL,
  diff                NUMERIC,
  suspected_cause     TEXT,
  context             JSONB,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_shadow_diff_academy_idx
  ON credit_shadow_diff (academy_id, created_at);
CREATE INDEX IF NOT EXISTS credit_shadow_diff_player_idx
  ON credit_shadow_diff (player_id, created_at);
CREATE INDEX IF NOT EXISTS credit_shadow_diff_scope_idx
  ON credit_shadow_diff (scope);
