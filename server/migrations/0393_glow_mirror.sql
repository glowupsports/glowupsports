-- Task #393: Glow Mirror Layer 1 — Player Voice DB migrations
-- Applied via: psql "$SUPABASE_DATABASE_URL" -c "..."
-- Status: APPLIED to production Supabase PostgreSQL

-- 1. Create player_session_reflections table
CREATE TABLE IF NOT EXISTS player_session_reflections (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id VARCHAR NOT NULL REFERENCES players(id),
  session_id VARCHAR NOT NULL REFERENCES sessions(id),
  academy_id VARCHAR REFERENCES academies(id),
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5),
  overall_feeling INTEGER CHECK (overall_feeling BETWEEN 1 AND 5),
  hardest_part TEXT,
  key_learning TEXT,
  next_focus TEXT,
  ai_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Unique constraint: one reflection per player per session
CREATE UNIQUE INDEX IF NOT EXISTS player_session_reflections_unique
  ON player_session_reflections (player_id, session_id);

-- 2. Add pre-match fields to match_reflections
ALTER TABLE match_reflections
  ADD COLUMN IF NOT EXISTS pre_match_mood TEXT,
  ADD COLUMN IF NOT EXISTS pre_match_confidence INTEGER CHECK (pre_match_confidence BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS pre_match_goal TEXT;

-- Comments for documentation
COMMENT ON TABLE player_session_reflections IS 'Player self-reported check-in after each training session (Glow Mirror Layer 1)';
COMMENT ON COLUMN match_reflections.pre_match_mood IS 'Pre-match mindset: nervous, focused, flat, confident, excited';
COMMENT ON COLUMN match_reflections.pre_match_confidence IS 'Pre-match confidence score 1-10';
COMMENT ON COLUMN match_reflections.pre_match_goal IS 'Player intention before the match, max 80 chars';
