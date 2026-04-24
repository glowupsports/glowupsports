-- Task #1153 — Don't kick guest invitees out of class groups when the class re-syncs.
--
-- Adds a `source` marker on `group_members` so `syncCommunityGroupForSeries`
-- can tell apart members it auto-added from class enrollment vs members a
-- coach (or anyone else) added manually. Only `source = 'class_sync'` rows
-- are removed when the class is re-synced.
--
-- Note: the canonical schema is `shared/schema.ts` and is applied via
-- `drizzle-kit push --force`. This file is kept for history + the data
-- backfill below, which `db:push` does not perform on its own.

ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Backfill: existing class-derived group members (active enrollees + the
-- series coach) are owned by class sync, so they should be removed when
-- they leave the class. Anyone else in the group (manual coach invites,
-- assistant coaches, parents, …) keeps the default 'manual' and is now
-- preserved across re-syncs.
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
