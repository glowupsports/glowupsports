-- Task #1270: Unify open match storage so the listing endpoint and the
-- join/leave/invite/kick endpoints share a single source of truth.
--
-- Before this migration `match_requests` was the read source for the home
-- "OPEN MATCHES" card and the Find-a-Match wizard write path, while the
-- /api/open-matches/:id/join (+leave/invite/kick) endpoints all wrote to
-- `open_matches` + `open_match_slots`. Result: every Join press 404'd
-- because the joined match did not exist in the slot-based table.
--
-- This migration:
--   1. Relaxes open_matches.booking_id to allow wizard matches without a
--      court booking.
--   2. Adds the columns we need to mirror match_requests (preferred_date,
--      preferred_time, is_adult, match_intent, invited_player_id, and the
--      court_booking_* picker triplet — also covers the missed Task #960
--      migration if that never landed).
--   3. Backfills every match_requests row whose status is open/confirmed/
--      full into open_matches AND inserts a host slot in open_match_slots
--      so capacity counts and the slot endpoints work out of the box.
--   4. Recomputes current_players from confirmed slots.
--   5. Marks the migrated match_requests rows with status='migrated' so
--      the listing endpoint never double-counts them and stale-cached
--      clients can be told MATCH_MIGRATED on /join.

ALTER TABLE "open_matches" ALTER COLUMN "booking_id" DROP NOT NULL;

ALTER TABLE "open_matches"
  ADD COLUMN IF NOT EXISTS "match_intent"         text DEFAULT 'friendly',
  ADD COLUMN IF NOT EXISTS "preferred_date"       date,
  ADD COLUMN IF NOT EXISTS "preferred_time"       text,
  ADD COLUMN IF NOT EXISTS "is_adult"             boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "invited_player_id"    varchar,
  ADD COLUMN IF NOT EXISTS "court_booking_status" text,
  ADD COLUMN IF NOT EXISTS "court_booking_note"   text,
  ADD COLUMN IF NOT EXISTS "court_booking_url"    text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'open_matches'
      AND constraint_name = 'open_matches_invited_player_id_players_id_fk'
  ) THEN
    ALTER TABLE "open_matches"
      ADD CONSTRAINT "open_matches_invited_player_id_players_id_fk"
      FOREIGN KEY ("invited_player_id")
      REFERENCES "players"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "open_matches_preferred_date_idx"
  ON "open_matches" ("preferred_date");

-- 3) Backfill match_requests -> open_matches. Idempotent on PK.
INSERT INTO "open_matches" (
  id, booking_id, host_player_id, academy_id,
  match_type, match_intent, title, description,
  preferred_date, preferred_time,
  required_level_min, required_level_max, required_ball_level,
  is_adult, max_players, current_players,
  status, invited_player_id, visibility,
  court_booking_status, court_booking_note, court_booking_url,
  created_at, updated_at
)
SELECT
  mr.id, NULL, mr.player_id, mr.academy_id,
  mr.match_type, mr.match_intent, mr.title, mr.description,
  mr.preferred_date, mr.preferred_time,
  mr.required_level_min, mr.required_level_max, mr.required_ball_level,
  mr.is_adult, mr.max_players, 1,
  mr.status, mr.invited_player_id, 'public',
  mr.court_booking_status, mr.court_booking_note, mr.court_booking_url,
  mr.created_at, mr.updated_at
FROM "match_requests" mr
WHERE mr.status IN ('open', 'confirmed', 'full')
ON CONFLICT (id) DO NOTHING;

-- 4) Insert host slot rows for every backfilled match. Idempotent on the
--    (match_id, player_id) unique index.
INSERT INTO "open_match_slots" (match_id, player_id, role, status)
SELECT mr.id, mr.player_id, 'host', 'confirmed'
FROM "match_requests" mr
WHERE mr.status IN ('open', 'confirmed', 'full')
ON CONFLICT ("match_id", "player_id") DO NOTHING;

-- 5) Recompute current_players from confirmed slots for backfilled rows
--    (and any pre-existing open_matches rows just to be safe).
UPDATE "open_matches" om
   SET current_players = COALESCE(slot_count.cnt, 1)
  FROM (
    SELECT match_id, COUNT(*)::int AS cnt
      FROM "open_match_slots"
     WHERE status = 'confirmed'
     GROUP BY match_id
  ) AS slot_count
 WHERE om.id = slot_count.match_id;

-- 6) Mark migrated match_requests rows so the listing endpoint never
--    double-counts them and the /join endpoint can return 410
--    MATCH_MIGRATED to stale clients.
UPDATE "match_requests"
   SET status = 'migrated', updated_at = NOW()
 WHERE status IN ('open', 'confirmed', 'full');
