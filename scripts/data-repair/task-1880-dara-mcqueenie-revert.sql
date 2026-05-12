-- Task #1880: Revert Dara McQueenie Feb 24 + Mar 17 attendance status
--             + refund Mar 17 holiday charge (Task #1874 side effect)
--
-- Player: Dara McQueenie (163b7ae1-6032-4f88-b0f4-f2ca0bf5eb64)
--
-- Problem:
--   Task #1874 incorrectly set attendance_status = 'present' for two sessions
--   and added an erroneous consume entry for the Mar 17 holiday session.
--
-- Target state:
--   Feb 24 (5fcad94d-7609-4217-a8c0-2a83c2c2eb13): absent,  net 1 charge
--   Mar 17 (b7ab431f-fedf-4800-bca3-8b383a8a815c): holiday, net 0 charges
--   group credit balance: -16
--
-- STATUS: ALREADY APPLIED on 2026-05-12 via direct psql.
--         This file is the auditable record of those changes.

-- Step 1: Revert attendance_status for Feb 24 (absent) and Mar 17 (holiday)
UPDATE session_players
SET attendance_status = 'absent'
WHERE player_id = '163b7ae1-6032-4f88-b0f4-f2ca0bf5eb64'
  AND session_id = '5fcad94d-7609-4217-a8c0-2a83c2c2eb13';

UPDATE session_players
SET attendance_status = 'holiday'
WHERE player_id = '163b7ae1-6032-4f88-b0f4-f2ca0bf5eb64'
  AND session_id = 'b7ab431f-fedf-4800-bca3-8b383a8a815c';

-- Step 2: Refund the erroneous Mar 17 holiday charge (+1 credit)
-- session_player_id for Mar 17: 06b2b4d5-935b-4524-b491-e57f81720e51
INSERT INTO credit_ledger_v2 (
  id, player_id, academy_id, type, delta, reason, event_key,
  session_id, session_player_id, balance_after, metadata
)
VALUES (
  gen_random_uuid(),
  '163b7ae1-6032-4f88-b0f4-f2ca0bf5eb64',
  'default-academy',
  'group',
  1,
  'refund',
  'refund:holiday-correction:06b2b4d5-935b-4524-b491-e57f81720e51:' || EXTRACT(EPOCH FROM now())::bigint,
  'b7ab431f-fedf-4800-bca3-8b383a8a815c',
  '06b2b4d5-935b-4524-b491-e57f81720e51',
  -16,
  jsonb_build_object('note', 'Holiday session Mar 17 — refund erroneous charge from Task #1874')
);

-- Step 3: Correct the balance table
UPDATE player_credit_balance
SET credits = -16
WHERE player_id = '163b7ae1-6032-4f88-b0f4-f2ca0bf5eb64'
  AND type = 'group';

-- Verification queries (run after applying):
--
-- SELECT
--   s.start_time AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Dubai' AS session_time,
--   sp.attendance_status,
--   (SELECT COUNT(*) FROM credit_ledger_v2 cl
--    WHERE cl.session_id = sp.session_id AND cl.player_id = sp.player_id
--    AND cl.reason = 'consume') AS consumes,
--   (SELECT COUNT(*) FROM credit_ledger_v2 cl
--    WHERE cl.session_id = sp.session_id AND cl.player_id = sp.player_id
--    AND cl.reason = 'refund') AS refunds
-- FROM session_players sp
-- JOIN sessions s ON s.id = sp.session_id
-- WHERE sp.player_id = '163b7ae1-6032-4f88-b0f4-f2ca0bf5eb64'
--   AND sp.session_id IN (
--     '5fcad94d-7609-4217-a8c0-2a83c2c2eb13',
--     'b7ab431f-fedf-4800-bca3-8b383a8a815c'
--   );
--
-- Expected:
--   2026-02-24 18:00:00 | absent  | 2 | 1   (net 1 charge)
--   2026-03-17 18:00:00 | holiday | 2 | 2   (net 0 charges)
--
-- SELECT credits FROM player_credit_balance
-- WHERE player_id = '163b7ae1-6032-4f88-b0f4-f2ca0bf5eb64' AND type = 'group';
--
-- Expected: -16
