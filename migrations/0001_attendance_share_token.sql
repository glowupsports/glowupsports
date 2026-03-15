ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "attendance_share_token" varchar(48);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "players_attendance_share_token_unique" ON "players" USING btree ("attendance_share_token");
