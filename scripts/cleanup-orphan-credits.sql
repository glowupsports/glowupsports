-- =====================================================================
-- Cleanup: orphan credit_transactions & ghost session_players (Task #623)
-- =====================================================================
-- Usage:
--   psql "$SUPABASE_DATABASE_URL" -f scripts/cleanup-orphan-credits.sql \
--     > .local/cleanup-credits-report.txt 2>&1
--
-- Always create a CSV backup first:
--   psql "$SUPABASE_DATABASE_URL" \
--     -c "\COPY credit_transactions TO '.local/backup-credit_transactions-$(date +%F).csv' WITH (FORMAT csv, HEADER true)"
--   psql "$SUPABASE_DATABASE_URL" \
--     -c "\COPY session_players TO '.local/backup-session_players-$(date +%F).csv' WITH (FORMAT csv, HEADER true)"
--
-- What it does:
--   1. Prints global counts and per-academy / per-player breakdowns
--   2. NULLs session_players.credit_transaction_id where the FK is broken
--   3. Deletes session_players whose session_id is missing (ghost rows)
--   4. Deletes duplicate session_players on cancelled sessions, keeping the
--      oldest legitimate row per (player_id, session_id)
--   5. Deletes credit_transactions whose package_id points to a deleted package,
--      while preserving rows that are part of the audit trail
--
-- Idempotent: a re-run on already-clean data reports 0 orphans and applies 0
-- changes.
--
-- Cache invalidation: restart the Express workflow (`Start App`) afterwards to
-- flush the in-memory credit-balance cache. The pattern-based invalidator
-- inside the API runs on the next mutation, but a workflow restart guarantees
-- fresh data on the very next read for every player.
-- =====================================================================

SET search_path TO public;

\echo '=== GLOBAL DRY-RUN COUNTS (before cleanup) ==='
SELECT 'Orphan credit_transactions (package_id -> deleted package, deletable)' AS item, COUNT(*) AS n
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
SELECT 'session_players on cancelled sessions', COUNT(*)
FROM session_players sp JOIN sessions s ON s.id = sp.session_id WHERE s.status = 'cancelled'
UNION ALL
SELECT 'duplicate session_players on cancelled sessions (extra rows to delete)', COUNT(*)
FROM (
  SELECT sp.id,
         ROW_NUMBER() OVER (PARTITION BY sp.player_id, sp.session_id ORDER BY sp.id) AS rn
  FROM session_players sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE s.status = 'cancelled'
) ranked
WHERE rn > 1
UNION ALL
SELECT 'duplicate session_players (any session, extra rows to delete)', COUNT(*)
FROM (
  SELECT sp.id,
         ROW_NUMBER() OVER (PARTITION BY sp.player_id, sp.session_id ORDER BY sp.id) AS rn
  FROM session_players sp
) ranked
WHERE rn > 1
UNION ALL
SELECT 'session_players on missing sessions (ghost)', COUNT(*)
FROM session_players sp WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sp.session_id);

\echo ''
\echo '=== PER-ACADEMY DRY-RUN ==='
SELECT
  COALESCE(a.name, '(no academy)') AS academy,
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
GROUP BY a.name
HAVING
  COUNT(*) FILTER (WHERE sp.credit_transaction_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)) > 0
  OR COUNT(*) FILTER (WHERE s.status = 'cancelled') > 0
  OR COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM sessions s2 WHERE s2.id = sp.session_id)) > 0
ORDER BY academy;

\echo ''
\echo '=== PER-PLAYER IMPACT (broken FKs + predicted balance delta) ==='
-- A broken FK means the row currently looks "covered" by a transaction that no
-- longer exists. After NULLing the FK, the player's `getUncoveredSessionsByType`
-- will treat the row as uncovered (i.e., -1 credit per row in the chip).
SELECT
  COALESCE(a.name, '(no academy)') AS academy,
  p.name AS player,
  p.id AS player_id,
  COUNT(*) FILTER (
    WHERE sp.credit_transaction_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)
  ) AS broken_fk_rows,
  -- predicted change: each broken row that is `present` will now appear as
  -- uncovered in the chip (-1 each). Other statuses don't move the chip.
  COUNT(*) FILTER (
    WHERE sp.attendance_status = 'present'
      AND sp.credit_transaction_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)
  ) AS predicted_extra_uncovered_credits
FROM session_players sp
JOIN players p ON p.id = sp.player_id
LEFT JOIN academies a ON a.id = p.academy_id
GROUP BY a.name, p.name, p.id
HAVING COUNT(*) FILTER (
  WHERE sp.credit_transaction_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)
) > 0
ORDER BY academy, player;

\echo ''
\echo '=== EXECUTING CLEANUP (single transaction) ==='
BEGIN;

-- Step 1: NULL out broken credit_transaction_id FKs
UPDATE session_players
SET credit_transaction_id = NULL,
    credit_deducted_at = NULL
WHERE credit_transaction_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM credit_transactions ct
    WHERE ct.id = session_players.credit_transaction_id
  );

-- Step 2: Delete ghost session_players (session row no longer exists)
DELETE FROM session_players
WHERE NOT EXISTS (
  SELECT 1 FROM sessions s WHERE s.id = session_players.session_id
);

-- Step 3: Delete duplicate session_players on cancelled sessions (keep oldest)
WITH ranked AS (
  SELECT sp.id,
         ROW_NUMBER() OVER (
           PARTITION BY sp.player_id, sp.session_id
           ORDER BY sp.id
         ) AS rn
  FROM session_players sp
  JOIN sessions s ON s.id = sp.session_id
  WHERE s.status = 'cancelled'
)
DELETE FROM session_players sp
USING ranked r
WHERE sp.id = r.id AND r.rn > 1;

-- Step 4: Delete orphan credit_transactions (package_id -> deleted package),
-- preserving audit-trail reasons.
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
SELECT 'duplicate session_players on cancelled sessions remaining', COUNT(*)
FROM (
  SELECT sp.id,
         ROW_NUMBER() OVER (PARTITION BY sp.player_id, sp.session_id ORDER BY sp.id) AS rn
  FROM session_players sp JOIN sessions s ON s.id = sp.session_id WHERE s.status = 'cancelled'
) ranked WHERE rn > 1;

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
\echo '2. getUncoveredSessionsByType (matches the chip displayed in UI):'
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
\echo 'Expected: semi_private = 21 -> chip shows -21'
