CREATE TABLE IF NOT EXISTS "group_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" varchar NOT NULL REFERENCES "community_groups"("id") ON DELETE CASCADE,
  "creator_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL DEFAULT 'social',
  "title" text NOT NULL,
  "description" text,
  "location" text,
  "sport" text,
  "event_date" timestamp NOT NULL,
  "max_players" integer,
  "opponent_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "match_challenge_id" varchar,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "group_event_rsvps" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" varchar NOT NULL REFERENCES "group_events"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'going',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "group_event_rsvps_event_user_unique" UNIQUE("event_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "group_events_group_id_idx" ON "group_events"("group_id");
CREATE INDEX IF NOT EXISTS "group_events_event_date_idx" ON "group_events"("event_date");
CREATE INDEX IF NOT EXISTS "group_event_rsvps_event_id_idx" ON "group_event_rsvps"("event_id");
