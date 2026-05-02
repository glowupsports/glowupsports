-- Add opening_hours JSONB field to academies table for venue profile
ALTER TABLE academies ADD COLUMN IF NOT EXISTS opening_hours JSONB;

-- Add indoor boolean to courts table so indoor/outdoor is a first-class attribute
-- independent of the surface type (a court can be indoor clay, indoor hard, etc.)
ALTER TABLE courts ADD COLUMN IF NOT EXISTS indoor BOOLEAN DEFAULT false;
UPDATE courts SET indoor = true WHERE surface = 'indoor';
