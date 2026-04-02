CREATE TABLE IF NOT EXISTS "family_invite_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL UNIQUE,
	"parent_player_id" varchar NOT NULL REFERENCES "players"("id"),
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"used_by_player_id" varchar REFERENCES "players"("id"),
	"created_at" timestamp DEFAULT now()
);
