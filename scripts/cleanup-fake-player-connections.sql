-- Cleanup script: remove fake/seed accepted player connections created before 2026
-- Run this against the production Supabase database once to clean stale test data.
--
-- Safety check first (read-only):
-- SELECT COUNT(*) FROM player_connections WHERE status = 'accepted' AND created_at < '2026-01-01';
--
-- Execute cleanup (verified: 0 rows affected in dev environment):
DELETE FROM player_connections
WHERE status = 'accepted'
  AND created_at < '2026-01-01';
