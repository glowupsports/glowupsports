-- Task #1100: Let coaches mark a 'pay later' booking as paid.
-- Enforce a hard one-payment-per-booking-request guarantee at the DB level
-- so concurrent "Mark paid" taps (or retried requests) cannot ever insert
-- duplicate rows. Application code wraps the insert in try/catch and falls
-- back to fetching the existing row when this constraint trips.

CREATE UNIQUE INDEX IF NOT EXISTS payments_booking_request_id_unique
  ON payments ((metadata->>'bookingRequestId'))
  WHERE metadata->>'bookingRequestId' IS NOT NULL;
