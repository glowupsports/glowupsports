-- Phase 2 follow-ups (per code review): unblock free players on
-- country/global feed items, preserve original feed-item scope on shadow
-- posts, add quiet-hours to player_social_notif_prefs, and ensure the
-- supporting tables (feed_items, player_blocks) exist on this DB.

-- 1) feed_items — created here for environments where the original Phase
--    1 migration was never applied. Mirrors shared/schema.ts.
CREATE TABLE IF NOT EXISTS feed_items (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     text NOT NULL,
  source_id       varchar NOT NULL,
  scope           text NOT NULL DEFAULT 'academy',
  country         text,
  academy_id      varchar REFERENCES academies(id),
  group_id        varchar REFERENCES community_groups(id),
  author_user_id  varchar REFERENCES users(id),
  author_player_id varchar REFERENCES players(id),
  post_id         varchar,
  payload         jsonb DEFAULT '{}'::jsonb,
  is_hidden       boolean DEFAULT false,
  occurred_at     timestamp,
  created_at      timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT feed_items_source_unique UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS feed_items_country_created_idx
  ON feed_items (country, created_at);
CREATE INDEX IF NOT EXISTS feed_items_scope_country_created_idx
  ON feed_items (scope, country, created_at);
CREATE INDEX IF NOT EXISTS feed_items_academy_created_idx
  ON feed_items (academy_id, created_at);
CREATE INDEX IF NOT EXISTS feed_items_author_created_idx
  ON feed_items (author_user_id, created_at);
CREATE INDEX IF NOT EXISTS feed_items_player_created_idx
  ON feed_items (author_player_id, created_at);
CREATE INDEX IF NOT EXISTS feed_items_group_created_idx
  ON feed_items (group_id, created_at);
CREATE INDEX IF NOT EXISTS feed_items_created_idx
  ON feed_items (created_at);

-- 2) player_blocks — also created defensively to mirror shared/schema.ts.
CREATE TABLE IF NOT EXISTS player_blocks (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id varchar NOT NULL,
  blocked_user_id varchar NOT NULL,
  created_at      timestamp DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS player_blocks_blocker_idx
  ON player_blocks (blocker_user_id);
CREATE INDEX IF NOT EXISTS player_blocks_blocked_idx
  ON player_blocks (blocked_user_id);

-- 3) Allow shadow posts to be created without an academy. Free players
--    have no academyId, so before this change resolveTargetPostId could
--    not materialize a post for their feed_items.
ALTER TABLE posts ALTER COLUMN academy_id DROP NOT NULL;

-- 4) Preserve the link from a shadow post back to its parent feed_item so
--    the authorization layer can fetch the original scope (friends |
--    squad | academy | country | global) instead of relying on the much
--    coarser posts.visibility.
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS feed_item_id varchar
    REFERENCES feed_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS posts_feed_item_idx ON posts (feed_item_id);

-- 5) Now that posts.id has feed_item_id, wire feed_items.post_id back to
--    posts(id) with cascade-delete (matches shared/schema.ts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints
     WHERE constraint_name = 'feed_items_post_id_fk'
  ) THEN
    ALTER TABLE feed_items
      ADD CONSTRAINT feed_items_post_id_fk
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 6) Quiet-hours support for the new social notifications path. Push is
--    suppressed during the window; in-app rows are still written so the
--    feed-unseen badge stays accurate.
ALTER TABLE player_social_notif_prefs
  ADD COLUMN IF NOT EXISTS quiet_hours_start integer,
  ADD COLUMN IF NOT EXISTS quiet_hours_end   integer;
