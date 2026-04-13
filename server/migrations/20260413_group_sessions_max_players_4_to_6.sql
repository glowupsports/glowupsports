-- Migration: Bump group session max capacity from 4 to 6
-- Date: 2026-04-13
-- Task: #510 — Group sessions: bump max capacity from 4 → 6 players
--
-- Context:
--   Group training sessions were defaulting to max_players=4 in two code paths
--   inside storage.ts (updateSeriesSessionType). The admin-series route handlers
--   already defaulted to 6, so existing sessions created via that path were fine.
--   291 sessions and 7 coaching_series in production had max_players=4.
--
-- Sessions left unchanged (intentional custom capacities):
--   max_players=2:  11 sessions   (small / semi-private style groups)
--   max_players=3:   1 series     (intentionally small)
--   max_players=8:  19 sessions   (larger groups)
--   max_players=11:  8 sessions   (11-person squads)
--
-- This one-time cleanup was executed directly via psql on 2026-04-13.
-- The root cause in application code was fixed separately in server/storage.ts
-- (both fallback values in updateSeriesSessionType changed from 4 → 6).

-- Step 1: update future/existing group sessions
UPDATE sessions
SET max_players = 6
WHERE session_type = 'group'
  AND max_players = 4;
-- Result: UPDATE 291

-- Step 2: update group coaching series
UPDATE coaching_series
SET max_players = 6
WHERE session_type = 'group'
  AND max_players = 4;
-- Result: UPDATE 7

-- Verification (should return 0 rows after running):
-- SELECT 'sessions' AS tbl, COUNT(*) FROM sessions WHERE session_type='group' AND max_players=4
-- UNION ALL
-- SELECT 'coaching_series', COUNT(*) FROM coaching_series WHERE session_type='group' AND max_players=4;
-- Result: (0 rows)
