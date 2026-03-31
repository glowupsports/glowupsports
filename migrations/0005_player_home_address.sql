-- Player home address validation columns
-- Adds home_address, home_lat, home_lng to players table
-- for storing Google-validated home location data (Task #207)

ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "home_address" text,
  ADD COLUMN IF NOT EXISTS "home_lat" double precision,
  ADD COLUMN IF NOT EXISTS "home_lng" double precision;
