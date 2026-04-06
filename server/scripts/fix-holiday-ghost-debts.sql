-- ============================================================================
-- Remediation script: Holiday ghost debt fix (applied 2026-04-06)
-- ============================================================================
-- WHAT: Some players had active debt transactions for sessions where they were
--       marked holiday/vacation. The root cause was that cancelSessionDebt()
--       was not called when attendance status was changed to holiday/vacation.
--
-- STATUS: These SQL statements have already been executed against Supabase.
--         This script exists as an audit trail / documentation of what was done.
--         DO NOT RE-RUN unless reverting to a backup — debts are already fixed.
-- ============================================================================

-- STEP 1: Cancel all holiday ghost debts (6 found across 5 players)
-- Ghost debt = session_debt transaction where player's attendance was holiday/vacation
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
-- Result: 6 rows updated (Julia Waheb, Ivy Smalberger, Siara Yusuf,
--         Gemma Gong, Filip Wozniak, Ella Maksoudian)

-- STEP 2: Fix Julia Waheb's 2 debts that had settledAt but missing settled:true
-- These rows were created by the package debt_settlement process which set settledAt
-- in metadata but did not also set settled:true, causing getPlayerCreditBalanceByType
-- to count them as still outstanding.
UPDATE credit_transactions
SET metadata = metadata || jsonb_build_object(
  'settled', true,
  'settledFixedAt', NOW()::text,
  'settledFixReason', 'backfill_missing_settled_flag'
)
WHERE id IN (
  'eaf2bf43-908a-4803-9e67-a9fc2f3f5ca3',
  'a8e0bc5f-3c52-4a87-852e-bdc74d174cef'
);
-- Result: 2 rows updated for player Julia Waheb (05db9b85-8598-4a66-ba74-c1ab30f438cc)

-- ============================================================================
-- VERIFICATION: Run after applying to confirm zero ghost debts remain
-- ============================================================================

-- Check 1: Should return 0 rows (no holiday/vacation debts that are uncancelled)
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

-- Check 2: Julia Waheb unsettled group debts = 1 (only Apr 3 session remains)
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
-- Expected: 1
