-- Add columns to booking_requests that exist in the Drizzle schema but were
-- never applied to the live database. These omissions caused the
-- [BookingExpiry] and [PreLessonReminder] cron jobs to crash every cycle with
-- `column "court_booking_status" does not exist` (and would crash on the other
-- columns too once that one was fixed) because Drizzle's `.select()` expands
-- to every schema-defined column.

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS expires_at timestamp,
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS coach_welcome_message text,
  ADD COLUMN IF NOT EXISTS counter_proposed_start timestamp,
  ADD COLUMN IF NOT EXISTS counter_proposed_end timestamp,
  ADD COLUMN IF NOT EXISTS counter_proposed_at timestamp,
  ADD COLUMN IF NOT EXISTS counter_proposal_status text,
  ADD COLUMN IF NOT EXISTS coach_pre_confirm_message text,
  ADD COLUMN IF NOT EXISTS player_pre_confirm_reply text,
  ADD COLUMN IF NOT EXISTS pre_lesson_reminder_sent_at timestamp,
  ADD COLUMN IF NOT EXISTS court_booking_status text,
  ADD COLUMN IF NOT EXISTS court_booking_note text,
  ADD COLUMN IF NOT EXISTS court_booking_url text;
