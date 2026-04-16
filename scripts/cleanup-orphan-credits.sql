-- Cleanup: orphan credit_transactions & ghost session_players (Task #623)
-- Usage: psql "$SUPABASE_DATABASE_URL" -f scripts/cleanup-orphan-credits.sql
--
-- What it does:
--   1. Reports counts of orphan rows (dry-run portion)
--   2. NULLs session_players.credit_transaction_id where the FK is broken
--   3. Deletes credit_transactions whose package_id points to a deleted package
--      (skips reasons that are part of audit trail: debt_settlement, package_purchased, refund)
--
-- Safe to re-run; second run should report 0 orphans and apply 0 changes.

\echo '=== DRY-RUN COUNTS (before cleanup) ==='
SELECT 'Orphan credit_transactions (package_id -> deleted package)' AS item, COUNT(*) AS n
FROM credit_transactions ct
WHERE ct.package_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = ct.package_id)
UNION ALL
SELECT 'session_players with broken credit_transaction_id FK', COUNT(*)
FROM session_players sp
WHERE sp.credit_transaction_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)
UNION ALL
SELECT 'session_players on cancelled sessions', COUNT(*)
FROM session_players sp JOIN sessions s ON s.id = sp.session_id WHERE s.status = 'cancelled'
UNION ALL
SELECT 'duplicate session_players (same player+session)', COUNT(*)
FROM (SELECT player_id, session_id FROM session_players GROUP BY player_id, session_id HAVING COUNT(*) > 1) d
UNION ALL
SELECT 'session_players on missing sessions', COUNT(*)
FROM session_players sp WHERE NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = sp.session_id);

\echo '=== EXECUTING CLEANUP (transaction) ==='
BEGIN;

-- Step 1: NULL out broken credit_transaction_id FKs on session_players
UPDATE session_players
SET credit_transaction_id = NULL,
    credit_deducted_at = NULL
WHERE credit_transaction_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = session_players.credit_transaction_id);

-- Step 2: Delete orphan credit_transactions whose package was hard-deleted.
-- Preserve rows whose reason is part of the audit trail.
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

\echo '=== POST-CLEANUP VERIFICATION ==='
SELECT 'broken FKs remaining' AS item, COUNT(*) AS n
FROM session_players sp
WHERE sp.credit_transaction_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.id = sp.credit_transaction_id)
UNION ALL
SELECT 'orphan credit_transactions remaining', COUNT(*)
FROM credit_transactions ct
WHERE ct.package_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = ct.package_id);
