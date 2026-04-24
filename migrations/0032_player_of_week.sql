-- Task #1125 — Social Phase 5
-- Player-of-the-Week + weekly skill challenge tables.

CREATE TABLE IF NOT EXISTS player_of_week (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  scope_id text NOT NULL,
  week_start date NOT NULL,
  player_id varchar NOT NULL REFERENCES players(id),
  xp_earned integer NOT NULL DEFAULT 0,
  matches_played integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS player_of_week_unique_idx
  ON player_of_week (scope, scope_id, week_start);
CREATE INDEX IF NOT EXISTS player_of_week_player_idx
  ON player_of_week (player_id);
CREATE INDEX IF NOT EXISTS player_of_week_week_idx
  ON player_of_week (week_start);

CREATE TABLE IF NOT EXISTS weekly_skill_challenges (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  hashtag text NOT NULL DEFAULT 'challenge:weekly',
  created_by varchar REFERENCES users(id),
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS weekly_skill_challenges_week_idx
  ON weekly_skill_challenges (week_start);
CREATE INDEX IF NOT EXISTS weekly_skill_challenges_active_idx
  ON weekly_skill_challenges (is_active);

-- Allow free-player country Player-of-the-Week celebration posts.
-- (Free players are not in any academy, so academy_id must be nullable.)
ALTER TABLE posts ALTER COLUMN academy_id DROP NOT NULL;
