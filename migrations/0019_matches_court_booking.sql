-- Add external court booking metadata to completed matches so the recap
-- can show booking status, note, and link after the match finishes.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS court_booking_status text,
  ADD COLUMN IF NOT EXISTS court_booking_note text,
  ADD COLUMN IF NOT EXISTS court_booking_url text;
