-- Task #1145: Allow cheers and comments on every type of community feed item.
--
-- This migration introduces engagement on `feed_items` (system events like
-- match_result, level_up, quest_complete, tournament_result, open_match,
-- coach_spotlight) by:
--   - creating the `feed_items` table (it existed in the Drizzle schema but
--     was never materialised in the database),
--   - adding `cheer_count` and `comment_count` counters on `feed_items`,
--   - extending `post_reactions` and `post_comments` so each row can be
--     keyed by either a `post_id` (existing posts) or a `feed_item_id`
--     (new system-feed engagement). Exactly one of the two is set per row.
--
-- Apply manually with:
--   psql "$SUPABASE_DATABASE_URL" -f server/migrations/20260424_feed_item_engagement.sql

BEGIN;

-- 1. feed_items table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS feed_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id varchar NOT NULL,
  scope text NOT NULL DEFAULT 'academy',
  country text,
  academy_id varchar REFERENCES academies(id),
  group_id varchar REFERENCES community_groups(id),
  author_user_id varchar REFERENCES users(id),
  author_player_id varchar REFERENCES players(id),
  post_id varchar REFERENCES posts(id) ON DELETE CASCADE,
  payload jsonb DEFAULT '{}'::jsonb,
  is_hidden boolean DEFAULT false,
  cheer_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  occurred_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT feed_items_source_unique UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS feed_items_country_created_idx        ON feed_items(country, created_at);
CREATE INDEX IF NOT EXISTS feed_items_scope_country_created_idx  ON feed_items(scope, country, created_at);
CREATE INDEX IF NOT EXISTS feed_items_academy_created_idx        ON feed_items(academy_id, created_at);
CREATE INDEX IF NOT EXISTS feed_items_author_created_idx         ON feed_items(author_user_id, created_at);
CREATE INDEX IF NOT EXISTS feed_items_player_created_idx         ON feed_items(author_player_id, created_at);
CREATE INDEX IF NOT EXISTS feed_items_group_created_idx          ON feed_items(group_id, created_at);
CREATE INDEX IF NOT EXISTS feed_items_created_idx                ON feed_items(created_at);

-- For pre-existing deployments that already had the table without counters,
-- add the new counter columns idempotently and backfill defaults.
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS cheer_count   integer NOT NULL DEFAULT 0;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

-- 2. post_reactions ---------------------------------------------------------
ALTER TABLE post_reactions
  ADD COLUMN IF NOT EXISTS feed_item_id varchar
  REFERENCES feed_items(id) ON DELETE CASCADE;

ALTER TABLE post_reactions ALTER COLUMN post_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS post_reactions_feed_item_idx ON post_reactions(feed_item_id);

-- 3. post_comments ----------------------------------------------------------
ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS feed_item_id varchar
  REFERENCES feed_items(id) ON DELETE CASCADE;

ALTER TABLE post_comments ALTER COLUMN post_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS post_comments_feed_item_idx ON post_comments(feed_item_id);

COMMIT;
