-- Task #975 — track coach/admin-recorded payments distinctly so they
-- surface on the player Payments tab and so a re-press of "Mark Paid"
-- on the same package is a no-op.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS package_id varchar,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS recorded_by_user_id varchar;

-- Idempotency guard: a single package can only have one
-- 'coach_mark_paid' payments row.
CREATE UNIQUE INDEX IF NOT EXISTS payments_unique_coach_package
  ON payments (package_id)
  WHERE source = 'coach_mark_paid';
