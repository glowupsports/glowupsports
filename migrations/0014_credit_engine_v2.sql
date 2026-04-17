-- Credit Engine V2 — Phase 1 foundation.
-- Creates the new ledger / lots / balance / money-wallet tables,
-- adds session.credit_cost, the academy feature flag, and the
-- players.is_test flag used by the replay script's eligibility filter.
--
-- Idempotent: every statement uses IF NOT EXISTS so it's safe to re-apply
-- on environments where the schema was bootstrapped via psql ahead of the
-- drizzle-kit run.

-- ---------- player flag ------------------------------------------------------
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------- academy feature flag --------------------------------------------
ALTER TABLE academies
  ADD COLUMN IF NOT EXISTS use_new_credit_system BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------- session credit cost ---------------------------------------------
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS credit_cost NUMERIC NOT NULL DEFAULT 1;

-- ---------- player_credit_balance -------------------------------------------
CREATE TABLE IF NOT EXISTS player_credit_balance (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  academy_id   VARCHAR NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  type         TEXT    NOT NULL, -- group | semi_private | private
  credits      NUMERIC NOT NULL DEFAULT 0, -- may go negative (debt)
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS player_credit_balance_unique
  ON player_credit_balance (player_id, academy_id, type);

-- ---------- credit_lots ------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_lots (
  id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  academy_id        VARCHAR NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  type              TEXT    NOT NULL,
  qty_total         NUMERIC NOT NULL,
  qty_remaining     NUMERIC NOT NULL,
  price_per_credit  NUMERIC NOT NULL DEFAULT 0,
  currency          TEXT    NOT NULL DEFAULT 'AED',
  status            TEXT    NOT NULL DEFAULT 'active', -- active | depleted | expired
  invoice_id        VARCHAR,
  source_package_id VARCHAR,
  purchased_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_lots_player_idx
  ON credit_lots (player_id, academy_id, type, status);
CREATE INDEX IF NOT EXISTS credit_lots_expiry_idx
  ON credit_lots (academy_id, status, expires_at);

-- ---------- credit_ledger_v2 ------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_ledger_v2 (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  academy_id         VARCHAR NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  type               TEXT    NOT NULL, -- group | semi_private | private | money
  delta              NUMERIC NOT NULL,
  reason             TEXT    NOT NULL, -- purchase|consume|refund|makeup|manual|expiry|money_charge|money_topup
  event_key          VARCHAR NOT NULL,
  actor_id           VARCHAR,
  actor_role         TEXT,
  session_id         VARCHAR,
  session_player_id  VARCHAR,
  lot_id             VARCHAR,
  invoice_id         VARCHAR,
  balance_after      NUMERIC NOT NULL,
  metadata           JSONB,
  occurred_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_v2_event_key_unique
  ON credit_ledger_v2 (event_key);
CREATE INDEX IF NOT EXISTS credit_ledger_v2_player_idx
  ON credit_ledger_v2 (player_id, academy_id, occurred_at);
CREATE INDEX IF NOT EXISTS credit_ledger_v2_academy_time_idx
  ON credit_ledger_v2 (academy_id, occurred_at);
CREATE INDEX IF NOT EXISTS credit_ledger_v2_session_idx
  ON credit_ledger_v2 (session_id);
CREATE INDEX IF NOT EXISTS credit_ledger_v2_session_player_idx
  ON credit_ledger_v2 (session_player_id);

-- ---------- player_money_wallet ---------------------------------------------
CREATE TABLE IF NOT EXISTS player_money_wallet (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  academy_id  VARCHAR NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
  balance     NUMERIC NOT NULL DEFAULT 0,
  currency    TEXT    NOT NULL DEFAULT 'AED',
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS player_money_wallet_unique
  ON player_money_wallet (player_id, academy_id);
