ALTER TABLE "session_waitlist" ADD COLUMN IF NOT EXISTS "offered_at" timestamp;
ALTER TABLE "session_waitlist" ADD COLUMN IF NOT EXISTS "claim_window_minutes" integer DEFAULT 30;
