-- Task #403: Match Data → Pillar Scores (Glow 1–5)
-- Adds last_change_source column to player_pillar_progress to track
-- whether the most recent EMA update came from coach_assessment, match,
-- or coach_verified_match.

ALTER TABLE player_pillar_progress
  ADD COLUMN IF NOT EXISTS last_change_source TEXT;

COMMENT ON COLUMN player_pillar_progress.last_change_source IS
  'Source of the most recent EMA update: coach_assessment | match | coach_verified_match';
