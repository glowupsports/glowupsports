-- ============================================================================
-- Remediation script: Holiday ghost debt fix (applied 2026-04-06)
-- ============================================================================
-- WHAT: Some players had active debt transactions for sessions where they were
--       marked holiday/vacation. The root cause was that cancelSessionDebt()
--       was not called when attendance status was changed to holiday/vacation.
--
-- STATUS: These SQL statements have already been executed against Supabase.
--         This script exists as an audit trail / documentation of what was done.
--         DO NOT RE-RUN — debts are already fixed.
-- ============================================================================

-- STEP 1: Cancel all holiday ghost debts (6 found across 5 players)
-- Ghost debt = session_debt transaction where player's attendance was holiday/vacation
-- Players fixed: Julia Waheb (Mar 6), Ivy Smalberger (Mar 6), Siara Yusuf (Mar 6),
--                Gemma Gong (Mar 10), Filip Wozniak (Mar 25), Ella Maksoudian (Mar 6)
UPDATE credit_transactions ct
SET metadata = ct.metadata || jsonb_build_object(
  'cancelled', true,
  'cancelledAt', NOW()::text,
  'cancelReason', 'ghost_debt_holiday_attendance',
  'cancelledByScript', 'fix-holiday-ghost-debts.sql'
)
WHERE ct.reason IN ('session_debt','session_join_debt','session_unpaid')
  AND ct.amount < 0
  AND COALESCE(ct.metadata->>'cancelled','false') != 'true'
  AND COALESCE(ct.metadata->>'settled','false') != 'true'
  AND EXISTS (
    SELECT 1 FROM session_players sp
    WHERE sp.player_id = ct.player_id
      AND sp.session_id = ct.session_id
      AND sp.attendance_status IN ('holiday','vacation')
  );
-- Result: 6 rows updated

-- ============================================================================
-- VERIFICATION: Run to confirm zero ghost debts remain
-- ============================================================================

-- Check 1: Should return 0 rows (no uncancelled holiday/vacation debts)
SELECT 
  p.name as player_name,
  ct.id as transaction_id,
  ct.created_at::date as debt_date,
  sp.attendance_status
FROM credit_transactions ct
JOIN session_players sp ON sp.player_id = ct.player_id AND sp.session_id = ct.session_id
JOIN players p ON p.id = ct.player_id
WHERE ct.reason IN ('session_debt','session_join_debt','session_unpaid')
  AND ct.amount < 0
  AND sp.attendance_status IN ('holiday','vacation')
  AND COALESCE(ct.metadata->>'cancelled','false') != 'true'
  AND COALESCE(ct.metadata->>'settled','false') != 'true';
-- Expected: 0 rows

-- Check 2: Julia Waheb unsettled group debts = 3
-- (13 sessions attended - 10 covered by her package = 3 remaining)
SELECT COUNT(*) as unsettled_group_debts
FROM credit_transactions
WHERE player_id = '05db9b85-8598-4a66-ba74-c1ab30f438cc'
  AND amount < 0
  AND type = 'debit'
  AND reason IN ('session_debt','session_join_debt','session_unpaid')
  AND COALESCE(metadata->>'isDebt','false') = 'true'
  AND credit_type = 'group'
  AND COALESCE(metadata->>'settled','false') != 'true'
  AND COALESCE(metadata->>'cancelled','false') != 'true';
-- Expected: 3
