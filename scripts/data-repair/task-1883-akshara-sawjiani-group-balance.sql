-- Task #1883 — Balance correction for Akshara Kaira Sawjiani (group credits -6 → -7).
--
-- Background:
--   Player:  Akshara Kaira Sawjiani  (id b763b244-d16b-4564-938c-02014f3153c2)
--   Academy: derived from existing ledger rows (verified: default-academy)
--   Type:    group
--
--   Akshara attended 7 group sessions, all charged via consume entries (total -7).
--   A `package_deleted_lot_consume_reversal` entry of +1 was created when a
--   package was deleted, which incorrectly reversed one session's charge.
--   This left her balance at -6 instead of the correct -7.
--
--   Ledger breakdown before fix:
--     7 × consume (-1 each)                       = -7
--     1 × purchase                                = +3
--     1 × manual                                  = +1
--     1 × package_deleted_lot_consume_reversal    = +1   ← should not benefit balance
--     1 × undo_debt_writeoff                      = -1
--     1 × package_deleted_debt_reversal           = -3
--     ─────────────────────────────────────────────────
--     Incorrect cached balance                    = -6
--     Correct balance (post-correction)           = -7
--
--   Before fix: group balance = -6
--   After corrective entry: ledger at -7; a subsequent +10 purchase then
--   brought the cached balance to 3 (the recompute step reflects the true sum).
--
-- Repair (idempotent — re-running is a no-op via event_key existence check):
--   1. Normalise the event_key of the initial corrective entry (inserted during
--      the task run) to the stable task-scoped key
--      `consume:correction:task-1883` so the idempotency guard below works.
--   2. Insert the corrective consume entry (-1, balance_after -7) if it does
--      not already exist under event_key `consume:correction:task-1883`.
--      academy_id is derived from the player's existing ledger rows.
--   3. Recompute player_credit_balance.credits from the full ledger sum for
--      this player's academy (idempotent — safe to re-run).
--
-- Verified post-run output (May 12 2026):
--   Corrective ledger row: delta=-1, balance_after=-7, reason=consume,
--     event_key=consume:correction:task-1883  ✓
--   Cached balance recomputed to match ledger sum (3 after a subsequent
--   +10 purchase; the recompute correctly reflects the true state).
--
-- Usage:
--   bash scripts/db-query.sh -f scripts/data-repair/task-1883-akshara-sawjiani-group-balance.sql

\set ON_ERROR_STOP on

BEGIN;

-- 1. Normalise the event_key of the UUID-keyed corrective entry (if present)
--    so future re-runs hit the idempotency guard in step 2.
UPDATE credit_ledger_v2
SET event_key = 'consume:correction:task-1883'
WHERE player_id  = 'b763b244-d16b-4564-938c-02014f3153c2'
  AND event_key  = 'consume:correction:1f32042a-c48a-4dd7-91e8-c1e40e2ebe27';

-- 2. Insert the corrective consume entry only if it does not already exist.
--    academy_id is derived from the player's own ledger rows to avoid
--    hardcoding a value that could differ across environments.
INSERT INTO credit_ledger_v2 (
  id, player_id, academy_id, type, delta, reason, event_key,
  actor_role, session_id, balance_after, metadata, occurred_at
)
SELECT
  gen_random_uuid(),
  'b763b244-d16b-4564-938c-02014f3153c2',
  (SELECT academy_id FROM credit_ledger_v2
   WHERE player_id = 'b763b244-d16b-4564-938c-02014f3153c2'
   LIMIT 1),
  'group',
  -1,
  'consume',
  'consume:correction:task-1883',
  'admin',
  NULL,
  -7,
  '{"kind":"balance_correction","note":"Re-charge for session reversal caused by package_deleted_lot_consume_reversal. Task #1883."}'::jsonb,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM credit_ledger_v2
  WHERE event_key = 'consume:correction:task-1883'
);

-- 3. Recompute cached group balance from the full ledger for this player's
--    academy (derived, not hardcoded; idempotent — safe to re-run).
UPDATE player_credit_balance pcb
SET credits = sub.total, updated_at = NOW()
FROM (
  SELECT academy_id, COALESCE(SUM(delta), 0)::numeric AS total
  FROM credit_ledger_v2
  WHERE player_id = 'b763b244-d16b-4564-938c-02014f3153c2'
    AND type      = 'group'
  GROUP BY academy_id
  LIMIT 1
) sub
WHERE pcb.player_id  = 'b763b244-d16b-4564-938c-02014f3153c2'
  AND pcb.academy_id = sub.academy_id
  AND pcb.type       = 'group';

-- Sanity output: credits should equal the full ledger sum for this player's
-- group type (reflects all entries including any made after this correction).
SELECT type, credits AS cached_balance,
       (SELECT COALESCE(SUM(delta),0) FROM credit_ledger_v2
        WHERE player_id = 'b763b244-d16b-4564-938c-02014f3153c2'
          AND type = 'group') AS ledger_sum
FROM player_credit_balance
WHERE player_id = 'b763b244-d16b-4564-938c-02014f3153c2'
  AND type      = 'group';

COMMIT;
