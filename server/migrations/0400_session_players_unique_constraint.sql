-- Task #477: Fix duplicate session_players — add unique constraint + clean up Federico duplicate
-- Applied via: psql "$SUPABASE_DATABASE_URL" -f server/migrations/0400_session_players_unique_constraint.sql
-- Note: Step 1 (data cleanup) is idempotent — DELETE WHERE id = ... is safe to re-run if row is gone.
-- Note: Step 2 (constraint) uses IF NOT EXISTS equivalent — will error if constraint already exists; skip if so.

-- Step 1: Remove known duplicate row for Federico Rota
-- Player e3df8b3a-c97b-42f7-a7ad-bd7472b39b94 in session e87a0779-7266-4089-86b3-a35bea8dde80
-- Keep original: 181cf608-6fa2-4eee-9abc-25e4508ea0cb
-- Delete duplicate created by repair run: 19028382-0ca7-4039-b6ee-0f8f74fbe217
DELETE FROM session_players WHERE id = '19028382-0ca7-4039-b6ee-0f8f74fbe217';

-- Step 2: Add unique constraint to prevent future duplicates
-- Ensures no player can appear twice in the same session
ALTER TABLE session_players
  ADD CONSTRAINT session_players_session_player_unique UNIQUE (session_id, player_id);
