-- Tournament Management schema additions
-- Adds sport, registrationDeadline, categories, xpReward, drawPublished, and winnerId
-- to the tournaments table for full tournament lifecycle support.
-- Also adds category to tournament_participants for category-based registration.

ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "sport" text NOT NULL DEFAULT 'tennis',
  ADD COLUMN IF NOT EXISTS "registration_deadline" timestamp,
  ADD COLUMN IF NOT EXISTS "categories" jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "xp_reward" integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "draw_published" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "winner_id" varchar REFERENCES "players"("id");

ALTER TABLE "tournament_participants"
  ADD COLUMN IF NOT EXISTS "category" text;
