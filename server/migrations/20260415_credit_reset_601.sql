-- =============================================================================
-- Migration: Credit System Clean Slate — Cancel All Debts
-- Task: #601
-- Executed: 2026-04-15
-- Author: Agent (task-601)
-- =============================================================================
--
-- WHAT & WHY
-- ----------
-- The credit/debt system had accumulated historical errors. Coaches requested a
-- clean slate: cancel all outstanding debt records so every player shows a
-- positive or zero balance. Audit trail is preserved — nothing is deleted.
--
-- APPROACH
-- --------
-- Records are NOT deleted. metadata.cancelled = true is stamped on each record
-- so the system's balance calculation ignores them going forward.
-- session_players, packages, XP data, and attendance history are untouched.
--
-- =============================================================================
-- BEFORE STATE (2026-04-15, prior to execution)
-- =============================================================================
--
-- Note: The task description estimated 268 unsettled debt records across 58
-- players. The actual counts at execution time were lower (248 records, 39
-- players) because bugs fixed in #597, #598, and #599 had already cleaned up
-- some records before this migration ran.
--
-- Total unsettled debt records cancelled : 248
-- Distinct players with unsettled debts  : 39
-- Total credit-units owed                : 248
-- Reasons covered: session_debt, session_join_debt, session_unpaid
-- Predicate used (matching task spec):
--   reason IN ('session_debt','session_join_debt','session_unpaid')
--   AND COALESCE(metadata->>'settled','false') != 'true'
--   AND COALESCE(metadata->>'cancelled','false') != 'true'
--
-- Per-player breakdown (player_name | player_id | debt_count | total_debt):
--
--   Ella Maksoudian    | 342ddf4d-5f43-447b-ac55-3794bdddd752 | 33 | 33
--   Sofia Goga         | afe51233-9c5c-403a-8449-ab8248ad43d6 | 21 | 21
--   Camilla Rota       | 3d40e061-9ce9-4d66-8f59-196e97a68fbe | 20 | 20
--   Lynne Itani        | b0be0989-f441-43e2-8d70-3d21450236d3 | 19 | 19
--   Azmina Abdullaeva  | 4774cc10-8e54-4944-a885-39711c6a5907 | 12 | 12
--   Luisa Bauer        | 33190f3d-5d98-4cf9-b85e-1b39dc8a0dcd | 11 | 11
--   Oliver Turtle      | 6cee13d5-8cb7-406d-9205-5378f44153f2 | 10 | 10
--   Doudou Zhang       | d295b5fc-cc64-4035-a635-fa8d886988b6 | 10 | 10
--   Zi Jingxu          | 33c26151-236e-452a-96e9-b282aeb75eec |  9 |  9
--   ariana Madhvani    | c0310294-67fa-4b47-a3a3-7dffae54e820 |  9 |  9
--   Aisha Zhang        | 3d54b188-2861-4b37-99a3-ce49fe6565bd |  9 |  9
--   Martin Bercetche   | 4e69c17b-3226-43a1-903e-939c0674c6ea |  8 |  8
--   Gaspard Aujoulat   | 90b8465a-0863-444d-afcf-5010d535b571 |  7 |  7
--   Vinay Chandran     | e2544a8a-d66e-4035-ba15-9bc8e2645c30 |  7 |  7
--   The Law            | player-thelaw-001                    |  5 |  5
--   Maya Eva Waring    | 4069fd8e-9ada-48d6-85ef-5013158ba887 |  5 |  5
--   Olaf Rietveld      | 77bd8780-8141-484b-b047-70883ba2351f |  5 |  5
--   Erina Zalwango     | afd79b50-dae6-41be-a636-85c1bc3103a2 |  5 |  5
--   Ismail Mostafa     | d8a2ddc2-7902-438b-94af-a3bfd18b2d53 |  4 |  4
--   Jaro Elias Kubin   | c33c80b0-26a5-4e1c-9478-543a7ec4d344 |  4 |  4
--   Elina Kubin        | 4c8dd452-2342-414b-9307-e53edf9bb6e3 |  4 |  4
--   Evan Yong          | 25ddce95-55a8-445b-a461-b835e14527eb |  3 |  3
--   Marine Bustros     | e96c3f8c-bde8-4bab-8875-2d37ccdcd6ae |  3 |  3
--   Hannah Cameron     | 30fe0352-8291-4bf0-93e8-f98bbc000122 |  3 |  3
--   YanYan LI          | 441fe5d7-ae9d-42c2-b9b2-336f40b5650f |  3 |  3
--   Katja Valjarevic   | 209cd91c-e17c-4a7d-8172-9a324989df20 |  2 |  2
--   Emma Zalesski      | b70f9eb5-46b1-4e49-8b69-4f9e2ce05faf |  2 |  2
--   Victor Muller      | a111ae76-fff0-42c1-9739-28b01bd52606 |  2 |  2
--   Rouzbeh Fazlinejad | 2c6f6347-0978-45d3-9fbe-fe17ff6466fb |  2 |  2
--   Sheau Yin          | a7568597-892a-4186-a162-e68d388e70d2 |  2 |  2
--   Akshane Sawjiani   | 5569721f-45bc-4e77-92a2-3195347914fe |  1 |  1
--   Jad neaime         | f9e2ffa7-cced-4f9e-89a3-e6c451935160 |  1 |  1
--   Asher Woon         | 802dbccd-e014-400b-b8ee-4ba53ad5fba1 |  1 |  1
--   Lily McQueenie     | 3a834d48-f824-4ae9-aeed-cc37569c7da9 |  1 |  1
--   amelia michalski   | 90e184bf-3d41-478e-8e62-ea58ed4434d7 |  1 |  1
--   karim deghaili     | 08134bc5-f430-4064-bcea-ee00603857d9 |  1 |  1
--   Amron Louke        | b15e5418-2ff9-4973-a16f-14c7da247ea1 |  1 |  1
--   Dara McQueenie     | 163b7ae1-6032-4f88-b0f4-f2ca0bf5eb64 |  1 |  1
--   Vittoria Rota      | f48ba10c-b44c-4a9e-ba88-aaa64beac034 |  1 |  1
--
-- =============================================================================
-- AFTER STATE (verified immediately after execution)
-- =============================================================================
--
-- Records cancelled (UPDATE count)                                    : 248
-- Remaining unsettled (exact task predicate, no amount filter)        : 0
-- Remaining unsettled (balance-calc predicate incl. amount < 0)       : 0
-- session_players rows touched                                         : 0
-- packages rows touched                                                : 0
--
-- =============================================================================
-- IDEMPOTENT SQL (safe to re-run — skips already-cancelled records)
-- =============================================================================

UPDATE credit_transactions
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'cancelled', true,
  'cancelledAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'cancelledReason', 'credit_system_reset_601'
)
WHERE reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
  AND COALESCE(metadata->>'settled', 'false') != 'true'
  AND COALESCE(metadata->>'cancelled', 'false') != 'true';

-- Verification query — should return 0:
-- SELECT COUNT(*) as remaining_unsettled_debts
-- FROM credit_transactions
-- WHERE reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
--   AND COALESCE(metadata->>'settled', 'false') != 'true'
--   AND COALESCE(metadata->>'cancelled', 'false') != 'true';
