ALTER TABLE academy_settings
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT DEFAULT 'Free cancellation up to 24 hours before the lesson';
