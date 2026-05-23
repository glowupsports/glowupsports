-- Camp inclusions & original price (Task #2035)
-- Adds inclusions list and struck-through "from" price to coaching_series for camp packages

ALTER TABLE coaching_series
  ADD COLUMN IF NOT EXISTS inclusions jsonb,
  ADD COLUMN IF NOT EXISTS original_price numeric;
