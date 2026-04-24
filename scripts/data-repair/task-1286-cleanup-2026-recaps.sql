-- Task #1286 — One-off cleanup: remove the bogus mid-year 2026
-- "Your 2026 in Tennis" recaps that fired in April 2026.
--
-- Background:
--   `runYearlyRecapOnce` was triggered out-of-window because the boot path
--   used `setTimeout(cb, msUntilNextDecemberFirst(9))`. Node's setTimeout
--   can only handle delays up to 2^31-1 ms (~24.85 days); larger delays
--   silently coerce to 1 ms and fire immediately, so on every server
--   restart between February and November the recap ran right away.
--
--   The fix in `server/services/digestJobs.ts` adds (a) a hard window
--   guard inside `runYearlyRecapOnce` itself and (b) a daily-poll
--   scheduler that no longer overflows. This script cleans up the
--   already-persisted 2026 rows so the bogus "0 matches in 2026" card
--   stops appearing in the social feed.
--
-- What it does (idempotent — safe to re-run):
--   1. Deletes feed_items rows that point at a yearly_recap whose
--      year = 2026. Matches by source_id (the recap.id) so we surgically
--      remove only the ones backed by a 2026 recap row.
--   2. Belt-and-suspenders: deletes any feed_items where
--      source_type = 'yearly_recap' and the payload's `year` is 2026,
--      in case a publish wrote the feed item but the recap upsert
--      failed (or vice-versa).
--   3. Deletes the yearly_recaps rows themselves for year = 2026.
--
-- Out of scope:
--   • The on-demand `GET /api/year-in-tennis/:year` endpoint — players
--     can still open their wrap from the screen; it computes on the fly.
--   • Pre-2026 recaps and any other digest table.
--
-- Usage:
--   PGPASSWORD=... psql "<connection string>" \
--     -f scripts/data-repair/task-1286-cleanup-2026-recaps.sql

\set ON_ERROR_STOP on

BEGIN;

-- 1. Remove feed_items linked to a 2026 recap by source_id.
DELETE FROM feed_items fi
USING yearly_recaps yr
WHERE fi.source_type = 'yearly_recap'
  AND fi.source_id = yr.id
  AND yr.year = 2026;

-- 2. Belt-and-suspenders: any leftover yearly_recap feed item whose
--    payload reports year = 2026 (handles a recap-row-deleted-but-feed-
--    item-orphaned race).
DELETE FROM feed_items
WHERE source_type = 'yearly_recap'
  AND (payload->>'year')::int = 2026;

-- 3. Drop the underlying recap rows.
DELETE FROM yearly_recaps WHERE year = 2026;

-- Sanity output: both counts should be 0 after a successful run.
SELECT COUNT(*) AS remaining_2026_recaps
FROM yearly_recaps WHERE year = 2026;

SELECT COUNT(*) AS remaining_2026_feed_items
FROM feed_items
WHERE source_type = 'yearly_recap'
  AND (payload->>'year')::int = 2026;

COMMIT;
