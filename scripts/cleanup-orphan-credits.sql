-- =====================================================================
-- Cleanup: orphan credit_transactions & ghost session_players (Task #623)
-- =====================================================================
-- Usage:
--   PGOPTIONS="-csearch_path=public" psql "$SUPABASE_DATABASE_URL" \
--     -f scripts/cleanup-orphan-credits.sql \
--     > .local/cleanup-credits-report.txt 2>&1
--
-- A pre-cleanup INSERT-style backup must exist before running:
--   .local/backup-pre-cleanup-{YYYY-MM-DD}.sql
-- (see scripts/cleanup-orphan-credits-backup.sh)
--
-- Steps performed in order, in a single transaction:
--   1. NULL session_players.credit_transaction_id where the FK is broken
--   2. Pre-emptively NULL session_players.credit_transaction_id for any rows
--      that reference credit_transactions we are about to delete (avoids
--      introducing new broken refs)
--   3. Delete ghost session_players (no matching session)
--   4. Delete ALL session_players on cancelled sessions (per task intent —
--      they pollute uncovered-session counts because the production query
--      `getUncoveredSessionsByType` does not filter on session.status)
--   5. Delete eligible orphan credit_transactions (package_id -> deleted
--      package), preserving rows whose reason is part of the audit trail
--
-- Idempotent: a re-run on already-clean data reports zero orphans and
-- applies zero changes.
--
-- Cache invalidation: restart the Express workflow ("Start App") afterwards
-- to flush the in-memory credit-balance cache. The pattern-based invalidator
-- inside the API runs on the next mutation, but a workflow restart guarantees
-- fresh data on the very next read for every player.
-- =====================================================================

SET search_path TO public;

\echo '=== GLOBAL DRY-RUN COUNTS (before cleanup) ==='
SELECT 'orphan credit_transactions (deletable, audit reasons preserved)' AS item, COUNT(*) AS n
FROM credit_transactions ct
WHERE ct.package_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = ct.package_id)
  AND ct.reason NOT IN (
    'debt_settlement', 'session_settlement', 'package_purchased',
    'package_purchase', 'refund', 'package_deleted_refund'
  )
UNION ALL
SELECT 'session_players with broken credit_transaction_id FK', COUNT(*)
FROM session_players sp
WHERE sp.credit_transaction_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)
UNION ALL
SELECT 'session_players on cancelled sessions (will delete)', COUNT(*)
FROM session_players sp JOIN sessions s ON s.id = sp.session_id WHERE s.status = 'cancelled'
UNION ALL
SELECT 'session_players on missing sessions (ghost, will delete)', COUNT(*)
FROM session_players sp WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sp.session_id)
UNION ALL
SELECT 'duplicate session_players (informational)', COUNT(*)
FROM (SELECT player_id, session_id FROM session_players GROUP BY player_id, session_id HAVING COUNT(*) > 1) d;

\echo ''
\echo '=== PER-ACADEMY DRY-RUN ==='
WITH sp_stats AS (
  SELECT
    a.id   AS academy_id,
    a.name AS academy_name,
    COUNT(*) FILTER (
      WHERE sp.credit_transaction_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)
    ) AS broken_fks,
    COUNT(*) FILTER (WHERE s.status = 'cancelled') AS sps_on_cancelled,
    COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM sessions s2 WHERE s2.id = sp.session_id)) AS ghost_rows
  FROM session_players sp
  LEFT JOIN sessions s ON s.id = sp.session_id
  LEFT JOIN players p ON p.id = sp.player_id
  LEFT JOIN academies a ON a.id = p.academy_id
  GROUP BY a.id, a.name
),
ct_stats AS (
  SELECT
    a.id AS academy_id,
    COUNT(*) AS orphan_credit_transactions
  FROM credit_transactions ct
  LEFT JOIN players p ON p.id = ct.player_id
  LEFT JOIN academies a ON a.id = p.academy_id
  WHERE ct.package_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM packages pk WHERE pk.id = ct.package_id)
    AND ct.reason NOT IN (
      'debt_settlement', 'session_settlement', 'package_purchased',
      'package_purchase', 'refund', 'package_deleted_refund'
    )
  GROUP BY a.id
)
SELECT
  COALESCE(sp_stats.academy_name, '(no academy)') AS academy,
  sp_stats.broken_fks,
  sp_stats.sps_on_cancelled,
  sp_stats.ghost_rows,
  COALESCE(ct_stats.orphan_credit_transactions, 0) AS orphan_credit_transactions
FROM sp_stats
LEFT JOIN ct_stats ON ct_stats.academy_id = sp_stats.academy_id
WHERE sp_stats.broken_fks > 0
   OR sp_stats.sps_on_cancelled > 0
   OR sp_stats.ghost_rows > 0
   OR COALESCE(ct_stats.orphan_credit_transactions, 0) > 0
ORDER BY academy;

\echo ''
\echo '=== PER-PLAYER IMPACT (predicted credit-balance delta) ==='
-- For each affected player we predict how many extra uncovered credits
-- the chip will show after cleanup. Sources of extra uncovered credits:
--   * broken-FK rows with attendance_status='present' (NULLing the FK
--     unmasks them as uncovered)
-- Sources of fewer uncovered credits:
--   * 'present' rows on cancelled sessions that are deleted (these were
--     inflating the uncovered count beforehand)
SELECT
  COALESCE(a.name, '(no academy)') AS academy,
  p.name AS player,
  p.id AS player_id,
  COUNT(*) FILTER (
    WHERE sp.attendance_status = 'present'
      AND sp.credit_transaction_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)
  ) AS extra_uncovered_from_broken_fk,
  COUNT(*) FILTER (
    WHERE sp.attendance_status = 'present'
      AND s.status = 'cancelled'
  ) AS removed_uncovered_from_cancelled,
  COUNT(*) FILTER (
    WHERE sp.attendance_status = 'present'
      AND sp.credit_transaction_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)
  )
  - COUNT(*) FILTER (
    WHERE sp.attendance_status = 'present'
      AND s.status = 'cancelled'
  ) AS net_chip_delta
FROM session_players sp
JOIN players p ON p.id = sp.player_id
JOIN sessions s ON s.id = sp.session_id
LEFT JOIN academies a ON a.id = p.academy_id
GROUP BY a.name, p.name, p.id
HAVING
  COUNT(*) FILTER (
    WHERE sp.credit_transaction_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)
  ) > 0
  OR COUNT(*) FILTER (WHERE s.status = 'cancelled') > 0
ORDER BY academy, player;

\echo ''
\echo '=== EXECUTING CLEANUP (single transaction) ==='
BEGIN;

-- Step 1: NULL out broken credit_transaction_id FKs on session_players
UPDATE session_players
SET credit_transaction_id = NULL,
    credit_deducted_at = NULL
WHERE credit_transaction_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM credit_transactions ct
    WHERE ct.id = session_players.credit_transaction_id
  );

-- Step 2: Pre-emptive NULL — clear refs to credit_transactions we'll delete
-- in step 5. Prevents introducing new broken refs.
WITH to_delete AS (
  SELECT ct.id FROM credit_transactions ct
  WHERE ct.package_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = ct.package_id)
    AND ct.reason NOT IN (
      'debt_settlement', 'session_settlement', 'package_purchased',
      'package_purchase', 'refund', 'package_deleted_refund'
    )
)
UPDATE session_players
SET credit_transaction_id = NULL,
    credit_deducted_at = NULL
WHERE credit_transaction_id IN (SELECT id FROM to_delete);

-- Step 3: Delete ghost session_players (session row no longer exists)
DELETE FROM session_players
WHERE NOT EXISTS (
  SELECT 1 FROM sessions s WHERE s.id = session_players.session_id
);

-- Step 4a: NULL out credit_transactions.session_player_id where the linked
-- session_player is on a cancelled session and is about to be deleted.
-- Without this, step 4b would violate the FK
-- credit_transactions_session_player_id_fkey.
WITH sps_to_delete AS (
  SELECT sp.id
  FROM session_players sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE s.status = 'cancelled'
)
UPDATE credit_transactions
SET session_player_id = NULL
WHERE session_player_id IN (SELECT id FROM sps_to_delete);

-- Step 4b: Delete ALL session_players on cancelled sessions (per task intent).
-- Cancelled sessions should not contribute to attendance/credit calculations.
DELETE FROM session_players
WHERE session_id IN (
  SELECT id FROM sessions WHERE status = 'cancelled'
);

-- Step 5: Delete orphan credit_transactions, preserving audit-trail reasons
DELETE FROM credit_transactions
WHERE package_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = credit_transactions.package_id)
  AND reason NOT IN (
    'debt_settlement',
    'session_settlement',
    'package_purchased',
    'package_purchase',
    'refund',
    'package_deleted_refund'
  );

COMMIT;

\echo ''
\echo '=== POST-CLEANUP VERIFICATION ==='
SELECT 'broken FKs remaining' AS item, COUNT(*) AS n
FROM session_players sp
WHERE sp.credit_transaction_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)
UNION ALL
SELECT 'orphan credit_transactions remaining (deletable)', COUNT(*)
FROM credit_transactions ct
WHERE ct.package_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = ct.package_id)
  AND ct.reason NOT IN (
    'debt_settlement', 'session_settlement', 'package_purchased',
    'package_purchase', 'refund', 'package_deleted_refund'
  )
UNION ALL
SELECT 'ghost session_players remaining', COUNT(*)
FROM session_players sp WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sp.session_id)
UNION ALL
SELECT 'session_players on cancelled sessions remaining', COUNT(*)
FROM session_players sp JOIN sessions s ON s.id = sp.session_id WHERE s.status = 'cancelled';

\echo ''
\echo '=== AISHA HARD-RUN VERIFICATION ==='
\echo 'Player: Aisha Almahasneh (d176ca0b-af03-4c7b-9f05-14eac8cf151d)'
\echo ''
\echo '1. Raw `present` semi_private rows (any session status):'
SELECT s.session_type, sp.attendance_status, s.status AS session_status, COUNT(*) AS n
FROM session_players sp
JOIN sessions s ON s.id = sp.session_id
WHERE sp.player_id = 'd176ca0b-af03-4c7b-9f05-14eac8cf151d'
  AND s.session_type = 'semi_private'
  AND sp.attendance_status = 'present'
GROUP BY s.session_type, sp.attendance_status, s.status;

\echo ''
\echo '2. getUncoveredSessionsByType replica (matches the chip in the UI):'
SELECT s.session_type, count(*)::int AS uncovered_credits
FROM session_players sp
JOIN sessions s ON sp.session_id = s.id
WHERE sp.player_id = 'd176ca0b-af03-4c7b-9f05-14eac8cf151d'
  AND sp.attendance_status = 'present'
  AND NOT EXISTS (
    SELECT 1 FROM credit_transactions ct
    WHERE ct.id = sp.credit_transaction_id
      AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
      AND ct.package_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM packages pkg WHERE pkg.id = ct.package_id)
  )
GROUP BY s.session_type;

\echo ''
\echo '3. Hard assertion (raises division-by-zero on failure):'
DO $$
DECLARE
  semi_n int; group_n int; private_n int;
BEGIN
  SELECT count(*)::int INTO semi_n
  FROM session_players sp
  JOIN sessions s ON sp.session_id = s.id
  WHERE sp.player_id = 'd176ca0b-af03-4c7b-9f05-14eac8cf151d'
    AND sp.attendance_status = 'present'
    AND s.session_type = 'semi_private'
    AND NOT EXISTS (
      SELECT 1 FROM credit_transactions ct
      WHERE ct.id = sp.credit_transaction_id
        AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
        AND ct.package_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM packages pkg WHERE pkg.id = ct.package_id)
    );

  SELECT count(*)::int INTO group_n
  FROM session_players sp
  JOIN sessions s ON sp.session_id = s.id
  WHERE sp.player_id = 'd176ca0b-af03-4c7b-9f05-14eac8cf151d'
    AND sp.attendance_status = 'present'
    AND s.session_type = 'group'
    AND NOT EXISTS (
      SELECT 1 FROM credit_transactions ct
      WHERE ct.id = sp.credit_transaction_id
        AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
        AND ct.package_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM packages pkg WHERE pkg.id = ct.package_id)
    );

  SELECT count(*)::int INTO private_n
  FROM session_players sp
  JOIN sessions s ON sp.session_id = s.id
  WHERE sp.player_id = 'd176ca0b-af03-4c7b-9f05-14eac8cf151d'
    AND sp.attendance_status = 'present'
    AND s.session_type IN ('private', 'private_adjusted')
    AND NOT EXISTS (
      SELECT 1 FROM credit_transactions ct
      WHERE ct.id = sp.credit_transaction_id
        AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
        AND ct.package_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM packages pkg WHERE pkg.id = ct.package_id)
    );

  RAISE NOTICE 'Aisha uncovered map: { semi_private: %, group: %, private: % }', semi_n, group_n, private_n;

  IF semi_n != 21 OR group_n != 0 OR private_n != 0 THEN
    RAISE EXCEPTION 'AISHA ASSERTION FAILED — expected {semi_private:21, group:0, private:0}, got {%, %, %}', semi_n, group_n, private_n;
  END IF;

  RAISE NOTICE 'Aisha hard-run assertion PASSED ✓';
END $$;
