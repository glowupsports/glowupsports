-- ============================================================================
-- Remediation script: Debt double-counting fix (Task #597, applied 2026-04-15)
-- ============================================================================
-- WHAT:
--   The old package-purchase code path created `debt_settlement`
--   credit_transactions (reducing packages.remaining_credits) WITHOUT marking
--   the original `session_debt` entries as settled=true.  Both the session_debt
--   entries (counted as ongoing debt in getPlayerCreditBalanceByType) and the
--   package deduction (already applied to remaining_credits) were active
--   simultaneously, inflating players' negative balances.
--   Alex Lykov showed -17 instead of the correct ~-3.
--
-- WHO: ~31 players — those with credit_transactions.reason = 'debt_settlement'
--
-- DATE BOUNDARY: Only session_debt entries created ON OR BEFORE the latest
--   debt_settlement transaction for a given player+credit_type are candidates.
--   This protects legitimate post-package debts from being incorrectly settled.
--
-- HOW APPLIED: Via fixDebtDoubleCountingFor31Players() called at server startup
--   (server/index.ts → server/pushNotifications.ts).  The function is idempotent
--   and resume-safe:
--     - Per-player: tracks how much has already been settled by this script
--       and only processes the remainder on each boot.
--     - Per-row: the WHERE clause excludes rows already marked by this script.
--
-- SENTINEL: metadata->>'settledByScript' = 'fix_debt_double_counting_597'
--
-- STATUS: Applied automatically via OTA push on first server boot after deploy.
--         This script is an auditable record of the equivalent SQL logic.
-- ============================================================================

-- ============================================================================
-- STEP 1 (diagnostic — run before fix): Show affected players and debt scope
-- ============================================================================
SELECT
  p.name                                                       AS player_name,
  ds.player_id,
  ds.norm_credit_type,
  ds.total_covered,
  ds.latest_settlement_at,
  COUNT(ct.id)                                                 AS unsettled_debt_count,
  COALESCE(SUM(ABS(ct.amount::numeric)), 0)                    AS unsettled_debt_total
FROM (
  SELECT
    player_id,
    CASE
      WHEN credit_type IN ('semi', 'semi_private', 'semi_private_adjusted') THEN 'semi_private'
      WHEN credit_type IN ('private', 'private_adjusted')                   THEN 'private'
      ELSE 'group'
    END                         AS norm_credit_type,
    SUM(ABS(amount::numeric))   AS total_covered,
    MAX(created_at)             AS latest_settlement_at
  FROM credit_transactions
  WHERE reason = 'debt_settlement'
    AND amount < 0
  GROUP BY player_id, norm_credit_type
) ds
JOIN players p ON p.id = ds.player_id
LEFT JOIN credit_transactions ct
  ON  ct.player_id = ds.player_id
  AND CASE
        WHEN ct.credit_type IN ('semi', 'semi_private', 'semi_private_adjusted') THEN 'semi_private'
        WHEN ct.credit_type IN ('private', 'private_adjusted')                   THEN 'private'
        ELSE 'group'
      END = ds.norm_credit_type
  AND ct.type = 'debit'
  AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
  AND COALESCE(ct.metadata->>'settled',   'false') != 'true'
  AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
  AND ct.created_at <= ds.latest_settlement_at
GROUP BY p.name, ds.player_id, ds.norm_credit_type, ds.total_covered, ds.latest_settlement_at
ORDER BY unsettled_debt_total DESC;

-- ============================================================================
-- STEP 2 (diagnostic — spot-check Alex Lykov before fix)
-- Expected: ~17 unsettled group debts / ~17 owed before fix
-- ============================================================================
SELECT
  COUNT(*)                                  AS unsettled_group_debts,
  COALESCE(SUM(ABS(ct.amount::numeric)), 0) AS total_owed
FROM credit_transactions ct
JOIN players p ON p.id = ct.player_id
WHERE p.name ILIKE 'Alex Lykov'
  AND ct.type   = 'debit'
  AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
  AND COALESCE(ct.metadata->>'settled',   'false') != 'true'
  AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
  AND CASE
        WHEN ct.credit_type IN ('semi', 'semi_private', 'semi_private_adjusted') THEN 'semi_private'
        WHEN ct.credit_type IN ('private', 'private_adjusted')                   THEN 'private'
        ELSE 'group'
      END = 'group';

-- ============================================================================
-- STEP 3 — The equivalent bulk UPDATE (executed by the TypeScript function)
--
-- NOTE: The TypeScript function processes this as a per-player loop rather than
--       a single bulk UPDATE because the "up to total_covered" constraint
--       requires a running-sum cutoff that cannot be expressed safely in a
--       single idiomatic UPDATE without window functions and a CTE.
--
--       The CTE below is the exact SQL equivalent and is provided here for
--       auditability.  DO NOT run it manually — the startup function already
--       applied this logic with per-row idempotency checks.
-- ============================================================================

-- WITH debt_settlements AS (
--   SELECT
--     player_id,
--     CASE
--       WHEN credit_type IN ('semi', 'semi_private', 'semi_private_adjusted') THEN 'semi_private'
--       WHEN credit_type IN ('private', 'private_adjusted')                   THEN 'private'
--       ELSE 'group'
--     END       AS norm_credit_type,
--     SUM(ABS(amount::numeric)) AS total_covered,
--     MAX(created_at)           AS latest_settlement_at
--   FROM credit_transactions
--   WHERE reason = 'debt_settlement' AND amount < 0
--   GROUP BY player_id, norm_credit_type
-- ),
-- ranked_debts AS (
--   SELECT
--     ct.id,
--     ct.amount::numeric AS amount,
--     ds.total_covered,
--     SUM(ABS(ct.amount::numeric)) OVER (
--       PARTITION BY ct.player_id, ds.norm_credit_type
--       ORDER BY ct.created_at
--     ) AS running_total
--   FROM credit_transactions ct
--   JOIN debt_settlements ds
--     ON  ds.player_id = ct.player_id
--     AND ds.norm_credit_type = CASE
--           WHEN ct.credit_type IN ('semi', 'semi_private', 'semi_private_adjusted') THEN 'semi_private'
--           WHEN ct.credit_type IN ('private', 'private_adjusted')                   THEN 'private'
--           ELSE 'group'
--         END
--   WHERE ct.type   = 'debit'
--     AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
--     AND COALESCE(ct.metadata->>'settled',          'false') != 'true'
--     AND COALESCE(ct.metadata->>'cancelled',        'false') != 'true'
--     AND (ct.metadata->>'settledByScript' IS DISTINCT FROM 'fix_debt_double_counting_597')
--     AND ct.created_at <= ds.latest_settlement_at
-- )
-- UPDATE credit_transactions
-- SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
--   'settled',         true,
--   'settledByScript', 'fix_debt_double_counting_597',
--   'settledAt',       NOW()::text
-- )
-- WHERE id IN (
--   SELECT id FROM ranked_debts
--   WHERE running_total - ABS(amount) < total_covered  -- include only rows within the cap
-- );

-- ============================================================================
-- STEP 4 (verification — run after fix)
-- Alex Lykov should have ~3 unsettled group debts remaining
-- ============================================================================
-- SELECT
--   COUNT(*)                                  AS unsettled_group_debts_after_fix,
--   COALESCE(SUM(ABS(ct.amount::numeric)), 0) AS total_owed_after_fix
-- FROM credit_transactions ct
-- JOIN players p ON p.id = ct.player_id
-- WHERE p.name ILIKE 'Alex Lykov'
--   AND ct.type   = 'debit'
--   AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
--   AND COALESCE(ct.metadata->>'settled',   'false') != 'true'
--   AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
--   AND CASE
--         WHEN ct.credit_type IN ('semi', 'semi_private', 'semi_private_adjusted') THEN 'semi_private'
--         WHEN ct.credit_type IN ('private', 'private_adjusted')                   THEN 'private'
--         ELSE 'group'
--       END = 'group';
-- Expected: ~3

-- ============================================================================
-- STEP 5 (verification — confirm no players still double-counting)
-- Should return 0 rows where remaining_unsettled > (real_debt - debt_settlement_covered)
-- ============================================================================
-- SELECT
--   p.name, ds.player_id, ds.norm_credit_type,
--   ds.total_covered, still_unsettled.unsettled_total
-- FROM (
--   SELECT player_id,
--     CASE WHEN credit_type IN ('semi','semi_private','semi_private_adjusted') THEN 'semi_private'
--          WHEN credit_type IN ('private','private_adjusted') THEN 'private' ELSE 'group' END norm_credit_type,
--     SUM(ABS(amount::numeric)) total_covered, MAX(created_at) latest_at
--   FROM credit_transactions WHERE reason='debt_settlement' AND amount < 0
--   GROUP BY player_id, norm_credit_type
-- ) ds
-- JOIN (
--   SELECT player_id,
--     CASE WHEN credit_type IN ('semi','semi_private','semi_private_adjusted') THEN 'semi_private'
--          WHEN credit_type IN ('private','private_adjusted') THEN 'private' ELSE 'group' END norm_credit_type,
--     SUM(ABS(amount::numeric)) unsettled_total
--   FROM credit_transactions
--   WHERE type='debit' AND reason IN ('session_debt','session_join_debt','session_unpaid')
--     AND COALESCE(metadata->>'settled','false')  != 'true'
--     AND COALESCE(metadata->>'cancelled','false') != 'true'
--   GROUP BY player_id, norm_credit_type
-- ) still_unsettled USING (player_id, norm_credit_type)
-- JOIN players p ON p.id = ds.player_id
-- WHERE still_unsettled.unsettled_total > 0.5  -- any material remaining unsettled after coverage
-- ORDER BY still_unsettled.unsettled_total DESC;
