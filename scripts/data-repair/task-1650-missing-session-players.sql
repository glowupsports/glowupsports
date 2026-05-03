-- Task #1650 — Repair 5 missing session_player attendance rows
--
-- Root cause: Task #674 merge-endpoint bug dropped past session_player rows
-- for players enrolled in recurring series. This script is fully idempotent:
-- safe to run on a fresh DB (inserts) or re-run after a partial/complete run.
--
-- What this script does:
--   1. Ensures all 5 session_player rows exist with attendance_status='absent'
--      (inserts if missing; updates to 'absent' if present with wrong status)
--   2. Charges 1 credit for the 3 sessions where shouldChargeForAttendance=true:
--      group+absent and private+absent both charge; semi_private+absent does not
--   3. Upserts player_credit_balance for the 3 charged players
--   4. Decrements credit_lots.qty_remaining for Mingxi (has an active lot)
--   5. Verifies all invariants — rolls back if any check fails
--
-- Attendance status rationale (no cancellations exist for any session):
--   Filip Tomasz Wozniak (group,        2026-03-23): absent → charge 1 group credit
--   Zi Jingxu           (semi_private,  2026-03-14): absent → no charge
--   Aisha Zhang         (semi_private,  2026-03-14): absent → no charge
--   Mingxi Ji           (private,       2026-03-14): absent → charge 1 private credit
--   Sheau Yin Tan       (private,       2026-03-24): absent → charge 1 private credit
--
-- Post-repair balances (from pre-repair state):
--   Filip:  group   0 → -1  (depleted lots → debt)
--   Mingxi: private 8 →  7  (active lot 8612b030, depleted by 1)
--   Sheau:  private -19 → -20 (no lots → existing debt increases)
--
-- Run with:
--   bash scripts/db-query.sh -f scripts/data-repair/task-1650-missing-session-players.sql

BEGIN;

-- ============================================================
-- STEP 1: Ensure all 5 session_player rows exist with status='absent'
--
-- session_players has no unique constraint on (session_id, player_id), so we
-- use explicit INSERT + UPDATE to avoid duplicates on re-runs.
-- ============================================================

DO $$
DECLARE
  -- (session_id, player_id, credit_type) tuples
  pairs RECORD;
BEGIN
  FOR pairs IN SELECT *
    FROM (VALUES
      ('0ed7d57b-84b2-4e84-81f9-94bf3500c42a'::varchar, '6002ba81-19b2-4315-b9d2-75f96cd0fa21'::varchar),
      ('251ee974-6534-425b-a044-c477d1389b91'::varchar, '33c26151-236e-452a-96e9-b282aeb75eec'::varchar),
      ('251ee974-6534-425b-a044-c477d1389b91'::varchar, '3d54b188-2861-4b37-99a3-ce49fe6565bd'::varchar),
      ('3dd16985-b67a-436b-b6c6-8d1d3bcd60f1'::varchar, 'c8dc24c6-9627-4221-8484-b79e3a467240'::varchar),
      ('368197a6-f375-4d15-a496-f993f2b48668'::varchar, 'd97f3957-ef9b-48df-a5cd-b64fde6b6c3b'::varchar)
    ) AS t(sid, pid)
  LOOP
    -- Update if present with wrong status
    UPDATE session_players
    SET attendance_status = 'absent'
    WHERE session_id = pairs.sid AND player_id = pairs.pid
      AND attendance_status <> 'absent';

    -- Insert only if no row exists at all
    INSERT INTO session_players (id, session_id, player_id, attendance_status, is_guest)
    SELECT gen_random_uuid(), pairs.sid, pairs.pid, 'absent', false
    WHERE NOT EXISTS (
      SELECT 1 FROM session_players
      WHERE session_id = pairs.sid AND player_id = pairs.pid
    );
  END LOOP;
  RAISE NOTICE 'task-1650 step1: session_player rows ensured (insert or update)';
END;
$$;

-- ============================================================
-- STEP 2: Charge credits for the 3 chargeable absent sessions
--
-- event_key = 'consume:<session_player_id>' ensures idempotency:
-- if the consume row already exists, the block skips gracefully.
-- player_credit_balance is upserted via the unique index
-- (player_id, academy_id, type).
-- ============================================================

-- 2a. Filip Tomasz Wozniak — group session, balance 0 → -1 (debt)
DO $$
DECLARE
  v_sp_id     VARCHAR;
  v_bal_now   NUMERIC;
  v_bal_after NUMERIC;
  v_event_key VARCHAR;
BEGIN
  SELECT id INTO v_sp_id FROM session_players
  WHERE session_id = '0ed7d57b-84b2-4e84-81f9-94bf3500c42a'
    AND player_id  = '6002ba81-19b2-4315-b9d2-75f96cd0fa21'
  LIMIT 1;
  IF v_sp_id IS NULL THEN
    RAISE EXCEPTION 'task-1650: Filip session_player missing after step 1';
  END IF;

  v_event_key := 'consume:' || v_sp_id;
  IF EXISTS (SELECT 1 FROM credit_ledger_v2 WHERE event_key = v_event_key) THEN
    RAISE NOTICE 'task-1650 step2a: Filip consume already exists, skipping';
    RETURN;
  END IF;

  SELECT COALESCE(credits, 0) INTO v_bal_now FROM player_credit_balance
  WHERE player_id = '6002ba81-19b2-4315-b9d2-75f96cd0fa21'
    AND academy_id = 'default-academy' AND type = 'group';
  -- Guard: if no balance row exists yet, treat current balance as 0
  v_bal_now   := COALESCE(v_bal_now, 0);
  v_bal_after := v_bal_now - 1;

  INSERT INTO credit_ledger_v2 (
    id, player_id, academy_id, session_player_id, session_id,
    type, reason, delta, balance_after, lot_id, actor_id, actor_role,
    event_key, occurred_at, metadata
  ) VALUES (
    gen_random_uuid(),
    '6002ba81-19b2-4315-b9d2-75f96cd0fa21', 'default-academy',
    v_sp_id, '0ed7d57b-84b2-4e84-81f9-94bf3500c42a',
    'group', 'consume', -1, v_bal_after,
    NULL, NULL, 'system', v_event_key,
    '2026-03-23 14:00:00'::timestamp,
    '{"repair":"task-1650","note":"backfill absent charge — depleted lots, debt created"}'::jsonb
  );

  -- Upsert balance row (unique index: player_id, academy_id, type)
  INSERT INTO player_credit_balance (id, player_id, academy_id, type, credits)
  VALUES (gen_random_uuid(), '6002ba81-19b2-4315-b9d2-75f96cd0fa21', 'default-academy', 'group', v_bal_after)
  ON CONFLICT ON CONSTRAINT player_credit_balance_unique
  DO UPDATE SET credits = v_bal_after;

  RAISE NOTICE 'task-1650 step2a: Filip group credit % → %', v_bal_now, v_bal_after;
END;
$$;

-- 2b. Mingxi Ji — private session, balance 8 → 7 (active lot deducted)
DO $$
DECLARE
  v_sp_id     VARCHAR;
  v_lot_id    VARCHAR;
  v_bal_now   NUMERIC;
  v_bal_after NUMERIC;
  v_event_key VARCHAR;
BEGIN
  SELECT id INTO v_sp_id FROM session_players
  WHERE session_id = '3dd16985-b67a-436b-b6c6-8d1d3bcd60f1'
    AND player_id  = 'c8dc24c6-9627-4221-8484-b79e3a467240'
  LIMIT 1;
  IF v_sp_id IS NULL THEN
    RAISE EXCEPTION 'task-1650: Mingxi session_player missing after step 1';
  END IF;

  v_event_key := 'consume:' || v_sp_id;
  IF EXISTS (SELECT 1 FROM credit_ledger_v2 WHERE event_key = v_event_key) THEN
    RAISE NOTICE 'task-1650 step2b: Mingxi consume already exists, skipping';
    RETURN;
  END IF;

  -- FIFO: oldest active lot with remaining credits
  SELECT id INTO v_lot_id FROM credit_lots
  WHERE player_id = 'c8dc24c6-9627-4221-8484-b79e3a467240'
    AND academy_id = 'default-academy' AND type = 'private'
    AND status = 'active' AND qty_remaining >= 1
  ORDER BY purchased_at ASC LIMIT 1;

  SELECT COALESCE(credits, 0) INTO v_bal_now FROM player_credit_balance
  WHERE player_id = 'c8dc24c6-9627-4221-8484-b79e3a467240'
    AND academy_id = 'default-academy' AND type = 'private';
  v_bal_now   := COALESCE(v_bal_now, 0);
  v_bal_after := v_bal_now - 1;

  INSERT INTO credit_ledger_v2 (
    id, player_id, academy_id, session_player_id, session_id,
    type, reason, delta, balance_after, lot_id, actor_id, actor_role,
    event_key, occurred_at, metadata
  ) VALUES (
    gen_random_uuid(),
    'c8dc24c6-9627-4221-8484-b79e3a467240', 'default-academy',
    v_sp_id, '3dd16985-b67a-436b-b6c6-8d1d3bcd60f1',
    'private', 'consume', -1, v_bal_after,
    v_lot_id, NULL, 'system', v_event_key,
    '2026-03-14 11:00:00'::timestamp,
    '{"repair":"task-1650","note":"backfill absent charge"}'::jsonb
  );

  INSERT INTO player_credit_balance (id, player_id, academy_id, type, credits)
  VALUES (gen_random_uuid(), 'c8dc24c6-9627-4221-8484-b79e3a467240', 'default-academy', 'private', v_bal_after)
  ON CONFLICT ON CONSTRAINT player_credit_balance_unique
  DO UPDATE SET credits = v_bal_after;

  IF v_lot_id IS NOT NULL THEN
    UPDATE credit_lots
    SET qty_remaining = qty_remaining - 1,
        status = CASE WHEN qty_remaining - 1 <= 0 THEN 'depleted' ELSE status END
    WHERE id = v_lot_id;
  END IF;

  RAISE NOTICE 'task-1650 step2b: Mingxi private credit % → % (lot %)', v_bal_now, v_bal_after, v_lot_id;
END;
$$;

-- 2c. Sheau Yin Tan — private session, balance -19 → -20 (no lots, debt increases)
DO $$
DECLARE
  v_sp_id     VARCHAR;
  v_bal_now   NUMERIC;
  v_bal_after NUMERIC;
  v_event_key VARCHAR;
BEGIN
  SELECT id INTO v_sp_id FROM session_players
  WHERE session_id = '368197a6-f375-4d15-a496-f993f2b48668'
    AND player_id  = 'd97f3957-ef9b-48df-a5cd-b64fde6b6c3b'
  LIMIT 1;
  IF v_sp_id IS NULL THEN
    RAISE EXCEPTION 'task-1650: Sheau session_player missing after step 1';
  END IF;

  v_event_key := 'consume:' || v_sp_id;
  IF EXISTS (SELECT 1 FROM credit_ledger_v2 WHERE event_key = v_event_key) THEN
    RAISE NOTICE 'task-1650 step2c: Sheau consume already exists, skipping';
    RETURN;
  END IF;

  SELECT COALESCE(credits, 0) INTO v_bal_now FROM player_credit_balance
  WHERE player_id = 'd97f3957-ef9b-48df-a5cd-b64fde6b6c3b'
    AND academy_id = 'default-academy' AND type = 'private';
  v_bal_now   := COALESCE(v_bal_now, 0);
  v_bal_after := v_bal_now - 1;

  INSERT INTO credit_ledger_v2 (
    id, player_id, academy_id, session_player_id, session_id,
    type, reason, delta, balance_after, lot_id, actor_id, actor_role,
    event_key, occurred_at, metadata
  ) VALUES (
    gen_random_uuid(),
    'd97f3957-ef9b-48df-a5cd-b64fde6b6c3b', 'default-academy',
    v_sp_id, '368197a6-f375-4d15-a496-f993f2b48668',
    'private', 'consume', -1, v_bal_after,
    NULL, NULL, 'system', v_event_key,
    '2026-03-24 04:00:00'::timestamp,
    '{"repair":"task-1650","note":"backfill absent charge — no active lot, debt increased"}'::jsonb
  );

  INSERT INTO player_credit_balance (id, player_id, academy_id, type, credits)
  VALUES (gen_random_uuid(), 'd97f3957-ef9b-48df-a5cd-b64fde6b6c3b', 'default-academy', 'private', v_bal_after)
  ON CONFLICT ON CONSTRAINT player_credit_balance_unique
  DO UPDATE SET credits = v_bal_after;

  RAISE NOTICE 'task-1650 step2c: Sheau private credit % → % (debt)', v_bal_now, v_bal_after;
END;
$$;

-- ============================================================
-- STEP 3: Verification — all checks must pass or we roll back
-- ============================================================

-- 3a. Exactly 1 row per player/session pair, all with status='absent',
--     and no duplicates (total count = 5 unique absent pairs)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM session_players
  WHERE (session_id = '0ed7d57b-84b2-4e84-81f9-94bf3500c42a' AND player_id = '6002ba81-19b2-4315-b9d2-75f96cd0fa21' AND attendance_status = 'absent')
     OR (session_id = '251ee974-6534-425b-a044-c477d1389b91' AND player_id = '33c26151-236e-452a-96e9-b282aeb75eec' AND attendance_status = 'absent')
     OR (session_id = '251ee974-6534-425b-a044-c477d1389b91' AND player_id = '3d54b188-2861-4b37-99a3-ce49fe6565bd' AND attendance_status = 'absent')
     OR (session_id = '3dd16985-b67a-436b-b6c6-8d1d3bcd60f1' AND player_id = 'c8dc24c6-9627-4221-8484-b79e3a467240' AND attendance_status = 'absent')
     OR (session_id = '368197a6-f375-4d15-a496-f993f2b48668' AND player_id = 'd97f3957-ef9b-48df-a5cd-b64fde6b6c3b' AND attendance_status = 'absent');
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'task-1650 verify: expected 5 absent rows, found %', v_count;
  END IF;
  RAISE NOTICE 'task-1650 verify: 5 session_player absent rows ✓';
END;
$$;

-- 3b. 3 credit_ledger_v2 consume entries for the chargeable sessions
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM credit_ledger_v2 lv
  JOIN session_players sp ON sp.id = lv.session_player_id
  WHERE lv.reason = 'consume'
    AND (
      (sp.session_id = '0ed7d57b-84b2-4e84-81f9-94bf3500c42a' AND sp.player_id = '6002ba81-19b2-4315-b9d2-75f96cd0fa21')
      OR (sp.session_id = '3dd16985-b67a-436b-b6c6-8d1d3bcd60f1' AND sp.player_id = 'c8dc24c6-9627-4221-8484-b79e3a467240')
      OR (sp.session_id = '368197a6-f375-4d15-a496-f993f2b48668' AND sp.player_id = 'd97f3957-ef9b-48df-a5cd-b64fde6b6c3b')
    );
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'task-1650 verify: expected 3 consume ledger entries, found %', v_count;
  END IF;
  RAISE NOTICE 'task-1650 verify: 3 credit_ledger_v2 consume entries ✓';
END;
$$;

-- 3c. computeMissingAttendanceDrift check: 0 entries flagged for these 5 pairs
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM (
    SELECT 1
    FROM (VALUES
      ('6002ba81-19b2-4315-b9d2-75f96cd0fa21'::varchar, '0ed7d57b-84b2-4e84-81f9-94bf3500c42a'::varchar),
      ('33c26151-236e-452a-96e9-b282aeb75eec'::varchar, '251ee974-6534-425b-a044-c477d1389b91'::varchar),
      ('3d54b188-2861-4b37-99a3-ce49fe6565bd'::varchar, '251ee974-6534-425b-a044-c477d1389b91'::varchar),
      ('c8dc24c6-9627-4221-8484-b79e3a467240'::varchar, '3dd16985-b67a-436b-b6c6-8d1d3bcd60f1'::varchar),
      ('d97f3957-ef9b-48df-a5cd-b64fde6b6c3b'::varchar, '368197a6-f375-4d15-a496-f993f2b48668'::varchar)
    ) AS pairs(pid, sid)
    LEFT JOIN session_players sp ON sp.session_id = pairs.sid AND sp.player_id = pairs.pid
    WHERE sp.id IS NULL
       OR (sp.attendance_status = 'present' AND NOT EXISTS (
         SELECT 1 FROM credit_ledger_v2 lv WHERE lv.session_player_id = sp.id AND lv.reason = 'consume'
       ))
  ) flagged;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'task-1650 verify: reconciler would still flag % entries', v_count;
  END IF;
  RAISE NOTICE 'task-1650 verify: reconciler missing_session_player check = 0 ✓';
END;
$$;

-- 3d. computeCreditDrift check: no drift introduced for these 3 chargeable players
--     (expected consume = actual consume for these sessions)
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM (
    SELECT sp.player_id FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    WHERE sp.id IN (
      SELECT sp2.id FROM session_players sp2
      WHERE (sp2.session_id = '0ed7d57b-84b2-4e84-81f9-94bf3500c42a' AND sp2.player_id = '6002ba81-19b2-4315-b9d2-75f96cd0fa21')
         OR (sp2.session_id = '3dd16985-b67a-436b-b6c6-8d1d3bcd60f1' AND sp2.player_id = 'c8dc24c6-9627-4221-8484-b79e3a467240')
         OR (sp2.session_id = '368197a6-f375-4d15-a496-f993f2b48668' AND sp2.player_id = 'd97f3957-ef9b-48df-a5cd-b64fde6b6c3b')
    )
    AND sp.attendance_status = 'absent'
    AND NOT EXISTS (
      SELECT 1 FROM credit_ledger_v2 lv WHERE lv.session_player_id = sp.id AND lv.reason = 'consume'
    )
  ) uncovered;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'task-1650 verify: % chargeable absent rows have no consume entry — credit drift would remain', v_count;
  END IF;
  RAISE NOTICE 'task-1650 verify: all chargeable absent rows have consume entries — no credit drift ✓';
END;
$$;

COMMIT;

-- ============================================================
-- STEP 4: Post-repair summary report (read-only, runs after commit)
-- ============================================================
SELECT
  p.name                                           AS player,
  s.start_time::date                               AS session_date,
  s.session_type,
  sp.attendance_status,
  pcb.credits                                      AS balance_now,
  CASE WHEN lv.id IS NOT NULL
       THEN format('charged -1 (balance_after=%s)', lv.balance_after)
       ELSE 'no charge (semi_private absent)' END  AS credit_action
FROM session_players sp
JOIN players p ON p.id = sp.player_id
JOIN sessions s ON s.id = sp.session_id
JOIN player_credit_balance pcb
  ON pcb.player_id = sp.player_id
  AND pcb.academy_id = 'default-academy'
  AND pcb.type = CASE s.session_type
    WHEN 'group'       THEN 'group'
    WHEN 'semi_private' THEN 'semi_private'
    ELSE 'private'
  END
LEFT JOIN credit_ledger_v2 lv
  ON lv.session_player_id = sp.id AND lv.reason = 'consume'
WHERE (sp.session_id = '0ed7d57b-84b2-4e84-81f9-94bf3500c42a' AND sp.player_id = '6002ba81-19b2-4315-b9d2-75f96cd0fa21')
   OR (sp.session_id = '251ee974-6534-425b-a044-c477d1389b91' AND sp.player_id = '33c26151-236e-452a-96e9-b282aeb75eec')
   OR (sp.session_id = '251ee974-6534-425b-a044-c477d1389b91' AND sp.player_id = '3d54b188-2861-4b37-99a3-ce49fe6565bd')
   OR (sp.session_id = '3dd16985-b67a-436b-b6c6-8d1d3bcd60f1' AND sp.player_id = 'c8dc24c6-9627-4221-8484-b79e3a467240')
   OR (sp.session_id = '368197a6-f375-4d15-a496-f993f2b48668' AND sp.player_id = 'd97f3957-ef9b-48df-a5cd-b64fde6b6c3b')
ORDER BY s.start_time, p.name;
