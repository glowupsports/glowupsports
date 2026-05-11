-- Task #1841: Add Opn Payments (PromptPay) columns to academy_settings.
-- Allows academy owners to enable PromptPay QR as an alternative payment method.

ALTER TABLE academy_settings
  ADD COLUMN IF NOT EXISTS opn_public_key text,
  ADD COLUMN IF NOT EXISTS opn_secret_key text,
  ADD COLUMN IF NOT EXISTS prompt_pay_enabled boolean NOT NULL DEFAULT false;
