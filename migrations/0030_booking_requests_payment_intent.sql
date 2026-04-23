-- Task #1093: Lesson booking — show price, balance, and pay online
-- Tracks the player's chosen payment method on a booking request so the
-- coach can see whether to expect a credit deduction on approval or to
-- collect cash/bank transfer off-line. Card payments don't write to this
-- table (they materialise a session directly from the Stripe webhook).

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS payment_intent text;
