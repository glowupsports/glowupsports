-- Task #990 — extend the unique-payment guard to cover coach-granted
-- package-purchase rows so re-running the same package create cannot
-- duplicate the payments row. Combined with the original 'coach_mark_paid'
-- guard, every package can have at most one auto-recorded coach payment.
DROP INDEX IF EXISTS payments_unique_coach_package;

CREATE UNIQUE INDEX IF NOT EXISTS payments_unique_coach_package
  ON payments (package_id)
  WHERE source IN ('coach_mark_paid', 'coach_package_purchase');
