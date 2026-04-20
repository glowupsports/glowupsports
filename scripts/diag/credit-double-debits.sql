-- Task #817 — Forensic queries for double-debits, orphan debits, hidden negative wallet.
--
-- Run with:  psql "$DATABASE_URL" -f scripts/diag/credit-double-debits.sql
--
-- These are READ-ONLY. No writes happen. Use the output to confirm scope before
-- running scripts/reconcile-double-debits.ts.
--
-- 'Live' rows = NOT cancelled in metadata.

\echo '====================================================================='
\echo '  1. ORPHAN debits — session_debt rows missing session_id linkage'
\echo '====================================================================='
SELECT
  COUNT(*) AS orphan_debt_rows,
  COUNT(*) FILTER (WHERE metadata ? 'convertedFromBooking') AS orphan_with_booking,
  COUNT(DISTINCT player_id) AS players_affected
FROM credit_transactions
WHERE reason = 'session_debt'
  AND session_id IS NULL
  AND COALESCE(metadata->>'cancelled', 'false') != 'true';

\echo '====================================================================='
\echo '  2. DOUBLE debits — same (session_id, player_id) charged twice+'
\echo '====================================================================='
WITH dups AS (
  SELECT session_id, player_id, COUNT(*) AS n
  FROM credit_transactions
  WHERE reason IN ('session_debt', 'session_consumed')
    AND session_id IS NOT NULL
    AND COALESCE(metadata->>'cancelled', 'false') != 'true'
  GROUP BY session_id, player_id
  HAVING COUNT(*) > 1
)
SELECT
  COUNT(*)                       AS doubled_session_player_pairs,
  COUNT(DISTINCT player_id)      AS distinct_players,
  COUNT(DISTINCT session_id)     AS distinct_sessions,
  COALESCE(SUM(n - 1), 0)        AS extra_charges_to_cancel
FROM dups;

\echo '====================================================================='
\echo '  3. TOP 20 affected players (by extra duplicate charges)'
\echo '====================================================================='
WITH dups AS (
  SELECT session_id, player_id, COUNT(*) AS n
  FROM credit_transactions
  WHERE reason IN ('session_debt', 'session_consumed')
    AND session_id IS NOT NULL
    AND COALESCE(metadata->>'cancelled', 'false') != 'true'
  GROUP BY session_id, player_id
  HAVING COUNT(*) > 1
)
SELECT
  p.id            AS player_id,
  p.name          AS player_name,
  COUNT(*)        AS doubled_sessions,
  SUM(d.n - 1)    AS extra_charges
FROM dups d
JOIN players p ON p.id = d.player_id
GROUP BY p.id, p.name
ORDER BY extra_charges DESC
LIMIT 20;

\echo '====================================================================='
\echo '  4. Sample event_keys + reasons for doubled rows (first 25)'
\echo '====================================================================='
WITH dups AS (
  SELECT session_id, player_id
  FROM credit_transactions
  WHERE reason IN ('session_debt', 'session_consumed')
    AND session_id IS NOT NULL
    AND COALESCE(metadata->>'cancelled', 'false') != 'true'
  GROUP BY session_id, player_id
  HAVING COUNT(*) > 1
)
SELECT
  ct.created_at,
  ct.player_id,
  ct.session_id,
  ct.reason,
  ct.event_key,
  ct.amount
FROM credit_transactions ct
JOIN dups d
  ON d.session_id = ct.session_id
 AND d.player_id  = ct.player_id
WHERE ct.reason IN ('session_debt', 'session_consumed')
  AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
ORDER BY ct.player_id, ct.session_id, ct.created_at
LIMIT 25;

\echo '====================================================================='
\echo '  5. Players with NEGATIVE per-type V2 balance (debt visible in wallet)'
\echo '====================================================================='
SELECT
  p.id          AS player_id,
  p.name        AS player_name,
  pcb.type,
  pcb.credits
FROM player_credit_balance pcb
JOIN players p ON p.id = pcb.player_id
WHERE pcb.credits < 0
ORDER BY pcb.credits ASC
LIMIT 30;
