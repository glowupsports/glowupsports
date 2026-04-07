-- Migration: session_ai_briefs table
-- Pre-session AI coaching brief generated 30 minutes before each session

CREATE TABLE IF NOT EXISTS "session_ai_briefs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" varchar NOT NULL REFERENCES "sessions"("id"),
  "coach_id" varchar NOT NULL,
  "brief_text" text NOT NULL,
  "player_summaries" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "generated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "session_ai_briefs_session_uniq" ON "session_ai_briefs" ("session_id");
CREATE INDEX IF NOT EXISTS "session_ai_briefs_session_idx" ON "session_ai_briefs" ("session_id");
CREATE INDEX IF NOT EXISTS "session_ai_briefs_coach_idx" ON "session_ai_briefs" ("coach_id");
