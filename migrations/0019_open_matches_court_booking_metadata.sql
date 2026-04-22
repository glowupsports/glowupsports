-- Task #960: Persist court booking metadata for new open-match table
-- Mirrors the columns added to match_requests / match_challenges in Task #948.
ALTER TABLE "open_matches"
  ADD COLUMN IF NOT EXISTS "court_booking_status" text,
  ADD COLUMN IF NOT EXISTS "court_booking_note"   text,
  ADD COLUMN IF NOT EXISTS "court_booking_url"    text;
