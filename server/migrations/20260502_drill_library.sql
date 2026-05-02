-- Drill library extension: add new columns to drills table and create player drill tables

-- Extend drills table with UI-facing fields
ALTER TABLE drills
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'Other',
  ADD COLUMN IF NOT EXISTS difficulty text DEFAULT 'Intermediate',
  ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS steps jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tips text,
  ADD COLUMN IF NOT EXISTS skill_tags jsonb DEFAULT '[]'::jsonb;

-- Player saved drills (bookmarks)
CREATE TABLE IF NOT EXISTS player_saved_drills (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id varchar NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  drill_id varchar NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now(),
  UNIQUE(player_id, drill_id)
);
CREATE INDEX IF NOT EXISTS player_saved_drills_player_idx ON player_saved_drills(player_id);

-- Player drill logs (completions)
CREATE TABLE IF NOT EXISTS player_drill_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id varchar NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  drill_id varchar NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
  duration_done integer,
  rating integer CHECK (rating BETWEEN 1 AND 5),
  notes text,
  xp_awarded integer DEFAULT 0,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_drill_logs_player_idx ON player_drill_logs(player_id);
CREATE INDEX IF NOT EXISTS player_drill_logs_drill_idx ON player_drill_logs(drill_id);

-- Coach assigned drills
CREATE TABLE IF NOT EXISTS coach_assigned_drills (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id varchar NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  player_id varchar NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  drill_id varchar NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
  message text,
  assigned_at timestamp DEFAULT now(),
  dismissed_at timestamp,
  UNIQUE(coach_id, player_id, drill_id)
);
CREATE INDEX IF NOT EXISTS coach_assigned_drills_player_idx ON coach_assigned_drills(player_id);
CREATE INDEX IF NOT EXISTS coach_assigned_drills_coach_idx ON coach_assigned_drills(coach_id);
