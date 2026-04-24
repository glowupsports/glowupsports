-- Task #1252 — Restore Community → Groups tab.
--
-- Three columns declared in `shared/schema.ts` were missing from production
-- because `db push` had been silently hanging on an interactive
-- "add unique constraint?" prompt that `--force` does not cover, so no
-- ALTERs ever reached Supabase. Drizzle expands `select()` to every column
-- in the table, so each missing column 500-ed every endpoint touching that
-- table:
--
--   - GET /api/social/groups       → group_members.source missing
--   - GET /api/player/groups       → group_members.source missing
--   - GET /api/player/me/social    → posts.feed_item_id missing
--
-- The frontend then fell back to the "No groups yet" empty state even
-- though the user actually had 31 group memberships in the DB.
--
-- This migration applies exactly what `db push` should have applied,
-- mirroring `shared/schema.ts`:
--   - group_members.source (line 3903)
--   - group_members.added_manually (line 3913)
--   - posts.feed_item_id (line 4003)
--
-- All three are additive `ADD COLUMN IF NOT EXISTS` with the same defaults
-- declared in schema.ts. Idempotent — safe to re-run.

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS added_manually boolean NOT NULL DEFAULT false;

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS feed_item_id varchar;

-- Backfill: existing class-derived group members (active enrollees + the
-- series coach) should be marked `class_sync` so `syncCommunityGroupForSeries`
-- can prune them on re-sync. Anyone else stays 'manual' and is preserved
-- across re-syncs (Task #1153). Mirrors the backfill in
-- 0033_group_members_source.sql; idempotent because the WHERE clause
-- already filters on `source = 'manual'`.

UPDATE group_members gm
SET source = 'class_sync'
FROM community_groups cg
WHERE gm.group_id = cg.id
  AND cg.series_id IS NOT NULL
  AND gm.source = 'manual'
  AND (
    EXISTS (
      SELECT 1
      FROM series_players sp
      JOIN users u ON u.player_id = sp.player_id
      WHERE sp.series_id = cg.series_id
        AND sp.status = 'active'
        AND u.id = gm.user_id
    )
    OR EXISTS (
      SELECT 1
      FROM coaching_series cs
      JOIN users u ON u.coach_id = cs.coach_id
      WHERE cs.id = cg.series_id
        AND u.id = gm.user_id
    )
  );
