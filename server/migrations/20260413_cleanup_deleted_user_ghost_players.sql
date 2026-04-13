-- Migration: Clean up "Deleted User" ghost players from academy rosters
-- Date: 2026-04-13
-- Task: #509 — Fix "Deleted User" ghost players showing in coach list
--
-- Context:
--   When a player deleted their account via DELETE /api/player/me/account,
--   the server anonymised their PII (name → "Deleted User") but did NOT
--   remove the player from the academy's active roster.  Three such ghost
--   records were found in production:
--
--   Player ID                             | academy_id       | user deleted
--   07f1b9cd-869f-46bb-a371-591f05ac02f1 | default-academy  | true
--   126127ad-46fb-44e4-a3ec-df74a1983270 | default-academy  | true
--   47420589-2529-4bf3-a9fe-8d7394a19c25 | (none)           | false (legacy)
--
-- Fix applied:
--   Updated all three records to status='inactive', academy_id=NULL so they
--   no longer appear in any coach/academy active player list.
--   Historical session_players rows are preserved (no hard delete).
--
-- This one-time cleanup was executed directly via psql on 2026-04-13.
-- The root cause in the application code has been fixed separately in
-- server/routes/player-social.ts (DELETE /api/player/me/account now also
-- sets status='inactive' and academyId=null).

UPDATE players
SET
  status     = 'inactive',
  academy_id = NULL
WHERE name = 'Deleted User'
  AND status = 'active';

-- Verification (should return 0 rows after running):
-- SELECT id, name, status, academy_id
-- FROM players
-- WHERE name = 'Deleted User'
--   AND status = 'active';
