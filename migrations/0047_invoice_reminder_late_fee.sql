-- Task #2055: Invoice reminders + late fee configuration
-- Add reminder_sent_at to invoices table
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Add default late fee configuration to academy_settings table
ALTER TABLE academy_settings
  ADD COLUMN IF NOT EXISTS default_late_fee_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS default_late_fee_type TEXT DEFAULT 'flat';
