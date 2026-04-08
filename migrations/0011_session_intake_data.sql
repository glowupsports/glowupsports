-- Migration: session_intake_data
-- Stores pre-chat intake data captured before AI coaching sessions

CREATE TABLE IF NOT EXISTS "session_intake_data" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" varchar NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "player_id" varchar REFERENCES "players"("id") ON DELETE CASCADE,
  "coach_id" varchar NOT NULL REFERENCES "coaches"("id") ON DELETE CASCADE,
  "trained_skills" jsonb DEFAULT '[]'::jsonb,
  "intensity" text,
  "group_dynamics" jsonb,
  "player_tags" jsonb,
  "pillar_ratings" jsonb,
  "highlight" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "session_intake_session_idx" ON "session_intake_data"("session_id");
CREATE INDEX IF NOT EXISTS "session_intake_player_idx" ON "session_intake_data"("player_id");
