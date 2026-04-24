-- Task #1273: Drop the legacy match_requests table.
--
-- Task #1270 unified open match storage onto open_matches +
-- open_match_slots, leaving match_requests as a write-shadow target on
-- a few legacy endpoints. After several weeks of stable behaviour, the
-- legacy /api/play/match-requests endpoints were migrated to read/write
-- open_matches, and the table is no longer referenced anywhere in the
-- codebase. This migration drops it for good to remove the divergence
-- risk and reclaim the indexes/storage.

DROP INDEX IF EXISTS "match_requests_player_idx";
DROP INDEX IF EXISTS "match_requests_status_idx";
DROP INDEX IF EXISTS "match_requests_date_idx";

DROP TABLE IF EXISTS "match_requests" CASCADE;
