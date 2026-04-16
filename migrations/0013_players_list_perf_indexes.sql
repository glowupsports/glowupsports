-- Migration: Players list performance indexes
-- Task: #628 (Speed up Players loading in coach app)
-- Date: 2026-04-16
--
-- Adds three indexes that accelerate the GET /api/players?withCredits=true
-- hot path used by the coach Players screen:
--
-- 1) players_academy_status_idx
--    Supports the SQL status pushdown in getAllPlayersWithCredits
--    (filter by academy_id + status without scanning unrelated tenants).
--
-- 2) session_players_player_idx
--    Supports getPlayersLastSessions IN(...) lookup; the existing
--    session_players_session_player_unique constraint is leftmost on
--    session_id and cannot serve WHERE player_id IN (...) queries.
--
-- 3) credit_transactions_unsettled_debt_idx
--    Partial expression index that exactly matches the WHERE clause of
--    the JSONB-heavy debt aggregation in getPlayersCreditBalances.
--    EXPLAIN ANALYZE confirms an Index Scan instead of a Seq Scan after
--    this index is in place.
--
-- All three statements are idempotent (IF NOT EXISTS) so running this
-- migration on a database that already has them is a no-op.

CREATE INDEX IF NOT EXISTS players_academy_status_idx
  ON players(academy_id, status);

CREATE INDEX IF NOT EXISTS session_players_player_idx
  ON session_players(player_id);

CREATE INDEX IF NOT EXISTS credit_transactions_unsettled_debt_idx
  ON credit_transactions(player_id, credit_type)
  WHERE amount < 0
    AND COALESCE(metadata->>'settled', 'false') != 'true'
    AND COALESCE(metadata->>'cancelled', 'false') != 'true';
