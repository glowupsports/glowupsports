-- Task #950: Persist series reminder throttle across server restarts
CREATE TABLE IF NOT EXISTS "series_reminder_log" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "coach_id" varchar NOT NULL,
  "series_id" varchar NOT NULL,
  "sent_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "series_reminder_log_coach_series_sent_idx"
  ON "series_reminder_log" ("coach_id", "series_id", "sent_at");
