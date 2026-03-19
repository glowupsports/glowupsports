CREATE TABLE IF NOT EXISTS "provider_invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
	"token" text NOT NULL,
	"invited_email" text,
	"invited_name" text,
	"created_by" varchar NOT NULL,
	"used_by" varchar,
	"used_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "provider_invites_token_unique" UNIQUE("token")
);
