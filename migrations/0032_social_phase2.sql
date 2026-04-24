-- Task #1122 — Social Phase 2 (cheers/comments/mentions/notifications).
--
-- Generalises the existing reactions/comments tables to work on top of any
-- feed item (system match_result/level_up/quest_complete/tournament_result/
-- open_match/coach_spotlight in addition to manual moments) by lazily
-- materialising a backing posts row when the first interaction lands.
--
-- New columns / tables:
--   post_comments.mentioned_user_ids     — JSON array of user IDs resolved
--                                          from "@handle" tokens at write
--                                          time (used for fan-out).
--   user_social_profiles.feed_last_seen  — timestamp of the last time the
--                                          user opened the Community feed.
--                                          Drives the unseen counter / tab
--                                          badge.
--   player_social_notif_prefs            — per-user opt-in toggles for the
--                                          four social notification
--                                          categories. Defaults are
--                                          conservative: cheers OFF,
--                                          comments/replies/mentions ON.
--   post_comments_post_created_idx       — speeds up `WHERE post_id = $1
--                                          AND created_at > $2` for the
--                                          unseen counter.

ALTER TABLE post_comments
  ADD COLUMN IF NOT EXISTS mentioned_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE user_social_profiles
  ADD COLUMN IF NOT EXISTS feed_last_seen_at timestamp;

CREATE TABLE IF NOT EXISTS player_social_notif_prefs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  cheers boolean NOT NULL DEFAULT false,
  comments boolean NOT NULL DEFAULT true,
  replies boolean NOT NULL DEFAULT true,
  mentions boolean NOT NULL DEFAULT true,
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS post_comments_post_created_idx
  ON post_comments (post_id, created_at);

CREATE INDEX IF NOT EXISTS post_reactions_post_created_idx
  ON post_reactions (post_id, created_at);
