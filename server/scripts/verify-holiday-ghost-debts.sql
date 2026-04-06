-- Verification query: check for any remaining holiday ghost debts
-- Run: psql "$SUPABASE_DATABASE_URL" -f server/scripts/verify-holiday-ghost-debts.sql

-- Should return 0 rows if retroactive cleanup was successful
SELECT 
  p.name as player_name,
  ct.id as debt_transaction_id,
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

-- Julia Waheb balance verification (should show 1 unsettled debt for Apr 3)
SELECT 
  'unsettled_debts' as metric,
  COUNT(*)::text as value
FROM credit_transactions
WHERE player_id = '05db9b85-8598-4a66-ba74-c1ab30f438cc'
  AND amount < 0
  AND COALESCE(metadata->>'settled','false') != 'true'
  AND COALESCE(metadata->>'cancelled','false') != 'true'
  AND type = 'debit'
  AND reason IN ('session_debt','session_join_debt','session_unpaid')
  AND COALESCE(metadata->>'isDebt','false') = 'true';
