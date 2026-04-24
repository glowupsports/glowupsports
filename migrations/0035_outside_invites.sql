-- Task #1271 — Outsider invites for the Match Finder revamp.
-- Tracks one-time deferred-deep-link tokens that a player generates to invite
-- someone who doesn't have the app yet (SMS / WhatsApp / email / copy link).
-- The token is what we resolve from the public landing page and from the
-- in-app deep link handler.

CREATE TABLE IF NOT EXISTS "outside_invites" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "inviter_player_id"     varchar NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "token"                 varchar(32) NOT NULL UNIQUE,
  "channel"               text,
  "hashed_contact"        text,
  "target_type"           text NOT NULL DEFAULT 'play',
  "target_id"             varchar,
  "message"               text,
  "created_at"            timestamp DEFAULT now(),
  "claimed_by_player_id"  varchar REFERENCES "players"("id"),
  "claimed_at"            timestamp,
  "expires_at"            timestamp
);

CREATE INDEX IF NOT EXISTS "outside_invites_inviter_idx"
  ON "outside_invites" ("inviter_player_id");
CREATE INDEX IF NOT EXISTS "outside_invites_target_idx"
  ON "outside_invites" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "outside_invites_hashed_contact_idx"
  ON "outside_invites" ("hashed_contact");
