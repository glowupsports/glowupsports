-- Task #1126 — Social Phase 6
-- Weekly/monthly digests, Year-in-Tennis recaps, auto-highlight reels.
-- All tables are idempotent: unique indexes on (player, period) so the
-- Sunday cron + first-of-month cron + December cron can re-run safely.

CREATE TABLE IF NOT EXISTS weekly_digests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id varchar NOT NULL REFERENCES players(id),
  week_start date NOT NULL,
  week_end date NOT NULL,
  matches_played integer NOT NULL DEFAULT 0,
  matches_won integer NOT NULL DEFAULT 0,
  court_minutes integer NOT NULL DEFAULT 0,
  xp_earned integer NOT NULL DEFAULT 0,
  quests_completed integer NOT NULL DEFAULT 0,
  level_changes integer NOT NULL DEFAULT 0,
  friends_played_with integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  feed_item_id varchar REFERENCES feed_items(id),
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS weekly_digests_player_week_unique
  ON weekly_digests (player_id, week_start);
CREATE INDEX IF NOT EXISTS weekly_digests_week_idx
  ON weekly_digests (week_start);
CREATE INDEX IF NOT EXISTS weekly_digests_player_idx
  ON weekly_digests (player_id);

CREATE TABLE IF NOT EXISTS monthly_digests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id varchar NOT NULL REFERENCES players(id),
  month_start date NOT NULL,
  month_end date NOT NULL,
  matches_played integer NOT NULL DEFAULT 0,
  matches_won integer NOT NULL DEFAULT 0,
  court_minutes integer NOT NULL DEFAULT 0,
  xp_earned integer NOT NULL DEFAULT 0,
  quests_completed integer NOT NULL DEFAULT 0,
  level_changes integer NOT NULL DEFAULT 0,
  friends_played_with integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  feed_item_id varchar REFERENCES feed_items(id),
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS monthly_digests_player_month_unique
  ON monthly_digests (player_id, month_start);
CREATE INDEX IF NOT EXISTS monthly_digests_month_idx
  ON monthly_digests (month_start);
CREATE INDEX IF NOT EXISTS monthly_digests_player_idx
  ON monthly_digests (player_id);

CREATE TABLE IF NOT EXISTS yearly_recaps (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id varchar NOT NULL REFERENCES players(id),
  year integer NOT NULL,
  matches_played integer NOT NULL DEFAULT 0,
  matches_won integer NOT NULL DEFAULT 0,
  court_minutes integer NOT NULL DEFAULT 0,
  xp_earned integer NOT NULL DEFAULT 0,
  quests_completed integer NOT NULL DEFAULT 0,
  level_changes integer NOT NULL DEFAULT 0,
  friends_played_with integer NOT NULL DEFAULT 0,
  country_rank integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  feed_item_id varchar REFERENCES feed_items(id),
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS yearly_recaps_player_year_unique
  ON yearly_recaps (player_id, year);
CREATE INDEX IF NOT EXISTS yearly_recaps_year_idx ON yearly_recaps (year);
CREATE INDEX IF NOT EXISTS yearly_recaps_player_idx ON yearly_recaps (player_id);

CREATE TABLE IF NOT EXISTS highlight_reels (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id varchar NOT NULL REFERENCES players(id),
  match_log_id varchar NOT NULL REFERENCES match_logs(id) ON DELETE CASCADE,
  frames jsonb NOT NULL DEFAULT '[]'::jsonb,
  caption text,
  duration_ms integer NOT NULL DEFAULT 12000,
  feed_item_id varchar REFERENCES feed_items(id),
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS highlight_reels_match_unique
  ON highlight_reels (match_log_id);
CREATE INDEX IF NOT EXISTS highlight_reels_player_idx
  ON highlight_reels (player_id);
