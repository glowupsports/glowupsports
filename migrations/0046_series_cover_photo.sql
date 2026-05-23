-- Task #2034 — Series/camp cover photo
--
-- Adds an optional cover image URL to coaching_series.
-- Stored as a raw object-storage key or /uploads/ path; resolved to a
-- signed URL at query time before being sent to clients.
--
-- Safe to re-run (IF NOT EXISTS guard).

ALTER TABLE coaching_series
  ADD COLUMN IF NOT EXISTS image_url text;
