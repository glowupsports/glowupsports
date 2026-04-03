ALTER TABLE players ADD COLUMN IF NOT EXISTS parent_email text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS parent_reporting boolean DEFAULT false;
