-- Task #1332 — DB-level safety net against duplicate consume rows.
--
-- credit_ledger_v2 already has a unique index on event_key, and the V2
-- engine's idempotency event_key for consume is "consume:<sessionPlayerId>",
-- which would naturally block dups. This partial unique index belt-and-
-- suspenders that contract directly on (session_player_id) so any future
-- regression that builds a different event_key still cannot insert a
-- second consume for the same session_player.
--
-- IMPORTANT: this index can only be created if there are 0 existing
-- duplicates. The reconcile script (server/scripts/reconcile-credit-balances.ts)
-- handles the dedup step before this migration runs in any new environment.
-- On production the index was created via psql on Apr 25, 2026 because
-- drizzle-kit push was blocked on an unrelated pre-existing prompt.

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_v2_no_dup_consume
  ON credit_ledger_v2 (session_player_id)
  WHERE reason = 'consume' AND session_player_id IS NOT NULL;
