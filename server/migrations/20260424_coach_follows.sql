-- Task #1175: Player → coach follow relationship.
--
-- Lets a player opt-in to following an individual public coach so the
-- coach's country-scope tip/drill posts (and any future coach-authored
-- items) start appearing in the player's main social feed.
--
-- Apply manually with:
--   psql "$SUPABASE_DATABASE_URL" -f server/migrations/20260424_coach_follows.sql
--
-- Idempotency: every statement uses IF NOT EXISTS so reruns are no-ops.

BEGIN;

CREATE TABLE IF NOT EXISTS coach_follows (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id varchar NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now()
);

-- One follow per (follower, coach). Re-following is a no-op via ON CONFLICT
-- in the route handler.
CREATE UNIQUE INDEX IF NOT EXISTS coach_follows_unique_pair
  ON coach_follows (follower_user_id, coach_id);

CREATE INDEX IF NOT EXISTS coach_follows_follower_idx
  ON coach_follows (follower_user_id);

CREATE INDEX IF NOT EXISTS coach_follows_coach_idx
  ON coach_follows (coach_id);

COMMIT;
