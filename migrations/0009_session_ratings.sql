CREATE TABLE IF NOT EXISTS "session_ratings" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" varchar NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "player_id" varchar NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "coach_id" varchar REFERENCES "coaches"("id") ON DELETE SET NULL,
  "academy_id" varchar REFERENCES "academies"("id") ON DELETE SET NULL,
  "rating" integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  "comment" text,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "session_ratings_session_id_player_id_unique" UNIQUE("session_id","player_id")
);

CREATE INDEX IF NOT EXISTS "session_ratings_session_id_idx" ON "session_ratings" ("session_id");
CREATE INDEX IF NOT EXISTS "session_ratings_player_id_idx" ON "session_ratings" ("player_id");
CREATE INDEX IF NOT EXISTS "session_ratings_coach_id_idx" ON "session_ratings" ("coach_id");
CREATE INDEX IF NOT EXISTS "session_ratings_academy_id_idx" ON "session_ratings" ("academy_id");
