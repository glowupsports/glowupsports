-- Task #1505 — Indexes backing the paginated attendance-history endpoint.
--
-- The coach-facing attendance history route (/api/coach/players/:id/attendance-history)
-- rewrites fetching into a UNION ALL CTE with SQL-level pagination.  These three
-- indexes directly accelerate the three inner-join predicates in that CTE, and
-- the credit-ledger lookup that follows.
--
-- All statements use IF NOT EXISTS so this migration is safe to re-run on
-- environments that already received the indexes via scripts/db-query.sh or
-- drizzle-kit push from the updated shared/schema.ts.

-- -------------------------------------------------------------------------
-- 1. sessions(series_id, status, start_time)
-- -------------------------------------------------------------------------
-- The CTE joins sessions on series_id, filters status != 'cancelled', and
-- orders/ranges by start_time.  Without this index Postgres must scan the
-- full sessions table; with it the join + filter + sort are index-only for
-- the majority of rows.
CREATE INDEX IF NOT EXISTS sessions_series_status_start_idx
  ON sessions (series_id, status, start_time);

-- -------------------------------------------------------------------------
-- 2. series_players(player_id, status)
-- -------------------------------------------------------------------------
-- The orphan-detection arm of the CTE (Branch B) joins series_players on
-- (series_id = s.series_id AND player_id = $playerId AND status IN (...)).
-- The existing series_players_series_player_idx covers (series_id, player_id)
-- but not the status filter; this composite on (player_id, status) lets
-- Postgres skip directly to the player's rows and filter by status.
CREATE INDEX IF NOT EXISTS series_players_player_status_idx
  ON series_players (player_id, status);

-- -------------------------------------------------------------------------
-- 3. credit_ledger_v2(player_id, session_id, reason)
-- -------------------------------------------------------------------------
-- The credit step fetches consume/consume_debt_settlement rows for the
-- current page's session IDs:
--   WHERE player_id = $id
--     AND session_id IN (...)
--     AND reason IN ('consume', 'consume_debt_settlement')
-- The existing credit_ledger_v2_player_idx covers (player_id, academy_id,
-- occurred_at) which doesn't help the session_id IN-list lookup.  This
-- composite makes the credit join selective on all three predicates.
CREATE INDEX IF NOT EXISTS credit_ledger_v2_player_session_reason_idx
  ON credit_ledger_v2 (player_id, session_id, reason);
