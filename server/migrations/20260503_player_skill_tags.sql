-- Task #1617: Add skill_tags column to players table for manual strength tag selection
ALTER TABLE players ADD COLUMN IF NOT EXISTS skill_tags jsonb DEFAULT '[]'::jsonb;
