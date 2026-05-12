-- Task #1876 — Holiday overcharge refund for Ella Maksoudian (group credits -33 → -29).
--
-- Background:
--   Player:  Ella Maksoudian  (id 342ddf4d-5f43-447b-ac55-3794bdddd752)
--   Academy: default-academy
--   Type:    group
--
--   Ella attended 29 group sessions (100% attendance, excluding holidays).
--   The April 15 backfill run incorrectly charged credits for 4 sessions
--   that had status = 'holiday' and should have been free:
--
--     session b5153133-ab0e-4fe6-bca3-84375c155af8  Mar 3  2026 17:00
--     session 66c326be-6944-4729-a49e-a2a284ad52ca  Mar 3  2026 18:00
--     session b7ab431f-fedf-4800-bca3-8b383a8a815c  Mar 17 2026 18:00
--     session bb253107-d957-4ff2-a418-ac3488eb5ef9  Mar 24 2026 18:00
--
--   Before fix: group balance = -33
--   After fix:  group balance = -29
--
--   Note: The semi-private Mar 13 holiday overcharge was refunded separately
--   on May 12 2026; semi_private is already correct at -4.
--   Private balance (-15) is unaffected by this script.
--
-- Repair (idempotent — re-running is a no-op via event_key existence check):
--   1. Insert 4 refund entries (+1 each) into credit_ledger_v2, one per
--      holiday session, using event_key
--      `refund:holiday-overcharge:task-1876:<session_id>` as the
--      idempotency guard.
--   2. Recompute player_credit_balance.credits from the full ledger
--      (rather than hard-coding -29) so re-runs stay safe.
--   3. Clear credit_deducted_at on those 4 session_players rows so the
--      sessions are no longer flagged as charged.
--
-- Verified post-run output (May 12 2026):
--   group:        -29
--   semi_private:  -4  (already correct)
--   private:      -15  (unchanged)
--   All 4 session_players.credit_deducted_at = NULL
--
-- Usage:
--   bash scripts/db-query.sh -f scripts/data-repair/task-1876-ella-maksoudian-group-refund.sql

\set ON_ERROR_STOP on

BEGIN;

-- 1a. Refund for Mar 3 17:00 holiday session (b5153133)
INSERT INTO credit_ledger_v2 (
  id, player_id, academy_id, type, delta, reason, event_key,
  actor_role, session_id, balance_after, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  '342ddf4d-5f43-447b-ac55-3794bdddd752',
  'default-academy',
  'group',
  1,
  'refund',
  'refund:holiday-overcharge:task-1876:b5153133-ab0e-4fe6-bca3-84375c155af8',
  'admin',
  'b5153133-ab0e-4fe6-bca3-84375c155af8',
  -32,
  '{"kind":"holiday_overcharge_refund","note":"Mar 3 17:00 session was a holiday — incorrectly charged in Apr 15 backfill. Task #1876."}'::jsonb,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM credit_ledger_v2
  WHERE event_key = 'refund:holiday-overcharge:task-1876:b5153133-ab0e-4fe6-bca3-84375c155af8'
);

-- 1b. Refund for Mar 3 18:00 holiday session (66c326be)
INSERT INTO credit_ledger_v2 (
  id, player_id, academy_id, type, delta, reason, event_key,
  actor_role, session_id, balance_after, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  '342ddf4d-5f43-447b-ac55-3794bdddd752',
  'default-academy',
  'group',
  1,
  'refund',
  'refund:holiday-overcharge:task-1876:66c326be-6944-4729-a49e-a2a284ad52ca',
  'admin',
  '66c326be-6944-4729-a49e-a2a284ad52ca',
  -31,
  '{"kind":"holiday_overcharge_refund","note":"Mar 3 18:00 session was a holiday — incorrectly charged in Apr 15 backfill. Task #1876."}'::jsonb,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM credit_ledger_v2
  WHERE event_key = 'refund:holiday-overcharge:task-1876:66c326be-6944-4729-a49e-a2a284ad52ca'
);

-- 1c. Refund for Mar 17 18:00 holiday session (b7ab431f)
INSERT INTO credit_ledger_v2 (
  id, player_id, academy_id, type, delta, reason, event_key,
  actor_role, session_id, balance_after, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  '342ddf4d-5f43-447b-ac55-3794bdddd752',
  'default-academy',
  'group',
  1,
  'refund',
  'refund:holiday-overcharge:task-1876:b7ab431f-fedf-4800-bca3-8b383a8a815c',
  'admin',
  'b7ab431f-fedf-4800-bca3-8b383a8a815c',
  -30,
  '{"kind":"holiday_overcharge_refund","note":"Mar 17 18:00 session was a holiday — incorrectly charged in Apr 15 backfill. Task #1876."}'::jsonb,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM credit_ledger_v2
  WHERE event_key = 'refund:holiday-overcharge:task-1876:b7ab431f-fedf-4800-bca3-8b383a8a815c'
);

-- 1d. Refund for Mar 24 18:00 holiday session (bb253107)
INSERT INTO credit_ledger_v2 (
  id, player_id, academy_id, type, delta, reason, event_key,
  actor_role, session_id, balance_after, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  '342ddf4d-5f43-447b-ac55-3794bdddd752',
  'default-academy',
  'group',
  1,
  'refund',
  'refund:holiday-overcharge:task-1876:bb253107-d957-4ff2-a418-ac3488eb5ef9',
  'admin',
  'bb253107-d957-4ff2-a418-ac3488eb5ef9',
  -29,
  '{"kind":"holiday_overcharge_refund","note":"Mar 24 18:00 session was a holiday — incorrectly charged in Apr 15 backfill. Task #1876."}'::jsonb,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM credit_ledger_v2
  WHERE event_key = 'refund:holiday-overcharge:task-1876:bb253107-d957-4ff2-a418-ac3488eb5ef9'
);

-- 2. Recompute cached group balance from the full ledger (idempotent).
UPDATE player_credit_balance pcb
SET credits = sub.total, updated_at = NOW()
FROM (
  SELECT COALESCE(SUM(delta), 0)::numeric AS total
  FROM credit_ledger_v2
  WHERE player_id  = '342ddf4d-5f43-447b-ac55-3794bdddd752'
    AND academy_id = 'default-academy'
    AND type       = 'group'
) sub
WHERE pcb.player_id  = '342ddf4d-5f43-447b-ac55-3794bdddd752'
  AND pcb.academy_id = 'default-academy'
  AND pcb.type       = 'group';

-- 3. Clear credit_deducted_at on the 4 holiday session_players rows
--    so they are no longer treated as charged (idempotent).
UPDATE session_players
SET credit_deducted_at = NULL
WHERE player_id  = '342ddf4d-5f43-447b-ac55-3794bdddd752'
  AND session_id IN (
    'b5153133-ab0e-4fe6-bca3-84375c155af8',
    '66c326be-6944-4729-a49e-a2a284ad52ca',
    'b7ab431f-fedf-4800-bca3-8b383a8a815c',
    'bb253107-d957-4ff2-a418-ac3488eb5ef9'
  );

-- Sanity output: group should show -29 after a successful run.
SELECT type, credits FROM player_credit_balance
WHERE player_id  = '342ddf4d-5f43-447b-ac55-3794bdddd752'
  AND academy_id = 'default-academy'
ORDER BY type;

COMMIT;
