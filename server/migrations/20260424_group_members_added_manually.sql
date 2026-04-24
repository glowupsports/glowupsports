-- Task #1152: Add `added_manually` flag to group_members so coaches can invite
-- assistants/parents/guests into class-derived community groups, and so the
-- series→group resync (`syncCommunityGroupForSeries` in server/storage.ts)
-- can preserve those manual invites instead of deleting them.
--
-- Applied via:
--   psql "$SUPABASE_DATABASE_URL" -f server/migrations/20260424_group_members_added_manually.sql
--
-- Idempotency: uses ADD COLUMN IF NOT EXISTS, so reruns are no-ops. Existing
-- rows are backfilled to the safe default of `false` (= came from class
-- enrollment / sync), matching the previous implicit behaviour.

BEGIN;

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS added_manually boolean NOT NULL DEFAULT false;

COMMIT;
