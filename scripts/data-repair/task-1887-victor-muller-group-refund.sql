-- Task #1887 — Holiday overcharge refund for Victor Muller (group credits -23 → -22).
--
-- Background:
--   Player:  Victor Muller  (id a111ae76-fff0-42c1-9739-28b01bd52606)
--   Academy: default-academy (derived from existing ledger rows)
--   Type:    group
--
--   Victor has 22 present sessions and 1 holiday session (Apr 5).
--   His balance incorrectly shows -23 instead of -22.
--
--   Root cause: an erroneous consume entry exists in credit_ledger_v2 for
--   the Apr 5 holiday session:
--     ledger row id:    30f8d7a5-a1df-4901-badf-029fb85ab5ed
--     event_key:        consume:960e8e83-b0ff-4af5-85d6-0d949f8e0e4c
--     session_id:       17537fc0-1d17-4de2-a769-c62d1d953949
--     session_players:  960e8e83-b0ff-4af5-85d6-0d949f8e0e4c
--   The session_players row correctly shows attendance_status = 'holiday'
--   and credit_deducted_at = NULL, but the consume ledger entry was never
--   removed.
--
--   Before fix: group balance = -23
--   After fix:  group balance = -22
--
-- Repair (idempotent — re-running is a no-op via event_key existence check):
--   1. Insert a +1 refund entry into credit_ledger_v2 for the Apr 5 holiday
--      session, guarded by event_key
--      `refund:holiday-correction:task-1887:17537fc0-1d17-4de2-a769-c62d1d953949`.
--   2. Recompute player_credit_balance.credits from the full ledger sum
--      (idempotent — safe to re-run).
--
-- Usage:
--   bash scripts/db-query.sh -f scripts/data-repair/task-1887-victor-muller-group-refund.sql

\set ON_ERROR_STOP on

BEGIN;

-- 1. Insert +1 refund for the Apr 5 holiday session (idempotent).
INSERT INTO credit_ledger_v2 (
  id, player_id, academy_id, type, delta, reason, event_key,
  actor_role, session_id, balance_after, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  'a111ae76-fff0-42c1-9739-28b01bd52606',
  (SELECT academy_id FROM credit_ledger_v2
   WHERE player_id = 'a111ae76-fff0-42c1-9739-28b01bd52606'
   LIMIT 1),
  'group',
  1,
  'refund',
  'refund:holiday-correction:task-1887:17537fc0-1d17-4de2-a769-c62d1d953949',
  'admin',
  '17537fc0-1d17-4de2-a769-c62d1d953949',
  -22,
  '{"kind":"holiday_overcharge_refund","note":"Apr 5 session was a holiday — consume entry was incorrectly retained. Task #1887."}'::jsonb,
  '2026-04-05 15:00:00'
WHERE NOT EXISTS (
  SELECT 1 FROM credit_ledger_v2
  WHERE event_key = 'refund:holiday-correction:task-1887:17537fc0-1d17-4de2-a769-c62d1d953949'
);

-- 2. Recompute cached group balance from the full ledger for this player's
--    academy (derived, not hardcoded; idempotent — safe to re-run).
UPDATE player_credit_balance pcb
SET credits = sub.total, updated_at = NOW()
FROM (
  SELECT academy_id, COALESCE(SUM(delta), 0)::numeric AS total
  FROM credit_ledger_v2
  WHERE player_id = 'a111ae76-fff0-42c1-9739-28b01bd52606'
    AND type      = 'group'
  GROUP BY academy_id
  LIMIT 1
) sub
WHERE pcb.player_id  = 'a111ae76-fff0-42c1-9739-28b01bd52606'
  AND pcb.academy_id = sub.academy_id
  AND pcb.type       = 'group';

-- Sanity output: credits should be -22; ledger_sum should match.
SELECT type, credits AS cached_balance,
       (SELECT COALESCE(SUM(delta), 0) FROM credit_ledger_v2
        WHERE player_id = 'a111ae76-fff0-42c1-9739-28b01bd52606'
          AND type      = 'group') AS ledger_sum
FROM player_credit_balance
WHERE player_id  = 'a111ae76-fff0-42c1-9739-28b01bd52606'
  AND type       = 'group';

COMMIT;
