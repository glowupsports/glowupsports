-- Task #1095 — "Online card payments — coming soon" teaser + interest capture.
-- Tiny table that records players who tap "Notify me" on a coming-soon feature.
-- One row per (player, feature_key); no expiry. Currently only used for an
-- aggregate count tile on the platform-owner dashboard. Task #1093 will read
-- this list to email players when online card payments actually go live.

CREATE TABLE IF NOT EXISTS "feature_interest" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "player_id" varchar NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "feature_key" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "feature_interest_player_feature_unique"
  ON "feature_interest" ("player_id", "feature_key");

-- Per-academy flag flipped to true by Task #1093 once online card payments are
-- wired up for that academy. Default false — booking wizard reads this to
-- decide whether to show the "Coming soon" teaser or the real Stripe option.
ALTER TABLE "academies"
  ADD COLUMN IF NOT EXISTS "online_card_enabled" boolean NOT NULL DEFAULT false;
