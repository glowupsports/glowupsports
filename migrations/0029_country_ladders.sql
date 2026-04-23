-- Task #1039 — Cross-Country Ladders
-- Extends `ladders` so a ladder can be scoped to a country (per sport) instead
-- of a single academy. Existing rows are unaffected: scope defaults to
-- 'academy' and the new columns are nullable.

ALTER TABLE "ladders" ALTER COLUMN "academy_id" DROP NOT NULL;
ALTER TABLE "ladders" ALTER COLUMN "created_by" DROP NOT NULL;

ALTER TABLE "ladders"
  ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'academy',
  ADD COLUMN IF NOT EXISTS "country_code" text,
  ADD COLUMN IF NOT EXISTS "sport" text;

CREATE INDEX IF NOT EXISTS "ladders_country_idx"
  ON "ladders" ("scope", "country_code", "sport");

-- Only one country ladder per (sport, country_code). Academy ladders are not
-- constrained by this index because either column may be null for them.
CREATE UNIQUE INDEX IF NOT EXISTS "ladders_country_unique"
  ON "ladders" ("scope", "country_code", "sport")
  WHERE "scope" = 'country';
