-- Task #1173 — One-time wallet repair for Luisa Bauer.
--
-- Background:
--   Player:  Luisa Bauer  (id 36dc6c3e-a39c-4b9a-ba4a-498f0094277d)
--   Academy: default-academy
--   Type:    group
--
--   Before this script ran, her group ledger contained:
--     • 10 pre-purchase consumes  (-10)
--     • +10 package purchase       (back to 0)
--     • 2 post-purchase consumes  (-2)
--     • -10 manual "Coach removed credits" on 24 Apr 2026
--           (id 6a0ddca9-2990-4f2f-84eb-ab95b5e9da87)  → wallet at -12 today
--     • -8 lot expiry (future-dated 11 Mar 2027, already applied)  → wallet at -20
--
--   The -10 manual was a Remove-Credits overdraw that pushed the wallet
--   below 0 — exactly the bug Task #1173 closes. The -8 expiry is correct
--   behaviour and is explicitly out of scope for this repair.
--
-- Repair (idempotent — re-running is a no-op):
--   1. Insert a +10 reversal of the bad -10 manual entry, tagged with the
--      same metadata reason the new server-derived reversal flow would
--      produce. event_key `manual:reversal:<orig id>` matches the new
--      reversal flow's idempotency key, so a coach who taps "Reverse
--      this adjustment" in the UI after this script ran is a no-op too.
--   2. Insert a +10 wallet correction so the documented acceptance state
--      ("Group 0, no debt, no red badge") is met without touching the
--      consume / expiry rows. event_key
--      `manual:repair:task-1173:<player>:group` keeps the entry unique.
--   3. Recompute player_credit_balance.credits from the ledger so the
--      cached running balance matches reality (rather than hard-coding
--      the new value). Safe even if the script is re-run.
--
-- Usage:
--   PGPASSWORD=... psql "<connection string>" \
--     -f scripts/data-repair/task-1173-luisa-bauer.sql

\set ON_ERROR_STOP on

BEGIN;

-- 1. Reversal of the bad -10 manual entry.
INSERT INTO credit_ledger_v2 (
  id, player_id, academy_id, type, delta, reason, event_key,
  actor_id, actor_role, balance_after, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  '36dc6c3e-a39c-4b9a-ba4a-498f0094277d',
  'default-academy',
  'group',
  10,
  'manual',
  'manual:reversal:6a0ddca9-2990-4f2f-84eb-ab95b5e9da87',
  '3750b8a8-f35b-49c6-ac87-7fd3e6d56db1',
  'admin',
  -10,
  jsonb_build_object(
    'reason',
    'Reversal of "Coach removed credits" (24 Apr 06:54) — Task #1173 wallet repair (manual overdraw)'
  ),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM credit_ledger_v2
  WHERE event_key = 'manual:reversal:6a0ddca9-2990-4f2f-84eb-ab95b5e9da87'
);

-- 2. Wallet correction so the post-repair balance matches the documented
--    acceptance state of 0 without touching the consume / expiry rows.
INSERT INTO credit_ledger_v2 (
  id, player_id, academy_id, type, delta, reason, event_key,
  actor_id, actor_role, balance_after, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  '36dc6c3e-a39c-4b9a-ba4a-498f0094277d',
  'default-academy',
  'group',
  10,
  'manual',
  'manual:repair:task-1173:36dc6c3e-a39c-4b9a-ba4a-498f0094277d:group',
  '3750b8a8-f35b-49c6-ac87-7fd3e6d56db1',
  'admin',
  0,
  jsonb_build_object(
    'reason',
    'Wallet repair (Task #1173) — clear residual ghost debt after reversing the bad -10 manual on 24 Apr; aligns wallet with attendance reality (12 sessions attended, all covered by package).'
  ),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM credit_ledger_v2
  WHERE event_key = 'manual:repair:task-1173:36dc6c3e-a39c-4b9a-ba4a-498f0094277d:group'
);

-- 3. Refresh the cached running balance from the full ledger so it
--    matches whatever the engine would compute on next read.
UPDATE player_credit_balance pcb
SET credits = sub.total, updated_at = NOW()
FROM (
  SELECT COALESCE(SUM(delta), 0)::numeric AS total
  FROM credit_ledger_v2
  WHERE player_id = '36dc6c3e-a39c-4b9a-ba4a-498f0094277d'
    AND academy_id = 'default-academy'
    AND type = 'group'
) sub
WHERE pcb.player_id = '36dc6c3e-a39c-4b9a-ba4a-498f0094277d'
  AND pcb.academy_id = 'default-academy'
  AND pcb.type = 'group';

-- Sanity output: should print credits = 0 after a successful run.
SELECT type, credits FROM player_credit_balance
WHERE player_id = '36dc6c3e-a39c-4b9a-ba4a-498f0094277d'
  AND academy_id = 'default-academy'
  AND type = 'group';

COMMIT;
