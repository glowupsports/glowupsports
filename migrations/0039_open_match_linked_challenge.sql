-- Task #1362 — Link an open match back to the direct challenge that
-- spawned it (the "Also list as an open match" toggle on the
-- ChallengeComposerModal). Used to cross-cancel between the two
-- records: opponent accepts → linked open match closes; another
-- player claims the open slot → linked challenge auto-withdraws with
-- status `withdrawn_open_filled`.
--
-- Nullable + ON DELETE SET NULL so deleting a challenge never
-- cascades through to wiping the historical open-match row.
ALTER TABLE "open_matches"
  ADD COLUMN IF NOT EXISTS "linked_challenge_id" varchar
    REFERENCES "match_challenges"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "open_matches_linked_challenge_idx"
  ON "open_matches" ("linked_challenge_id")
  WHERE "linked_challenge_id" IS NOT NULL;
