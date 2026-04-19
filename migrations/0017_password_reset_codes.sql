-- Task #750: Password reset codes (6-digit code + deep-link token)
CREATE TABLE IF NOT EXISTS "password_reset_codes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "code_hash" text NOT NULL,
  "token_hash" text,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "password_reset_codes_user_id_idx" ON "password_reset_codes" ("user_id");
CREATE INDEX IF NOT EXISTS "password_reset_codes_token_hash_idx" ON "password_reset_codes" ("token_hash");
