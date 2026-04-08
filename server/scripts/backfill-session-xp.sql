-- Backfill: Session attendance XP for player-thelaw-001
-- Run: psql "$SUPABASE_DATABASE_URL" -f server/scripts/backfill-session-xp.sql
--
-- Root cause: XP award code only fired for status='present', excluding 'late'.
-- This backfill adds session_attendance XP for all past sessions where the player
-- was marked present or late, skipping sessions already awarded (idempotent).

-- Step 1: Insert session attendance XP for each attended session (idempotent per session_id)
INSERT INTO xp_transactions (player_id, session_id, xp_amount, source, description, created_at)
SELECT 
  'player-thelaw-001',
  sp.session_id,
  10,
  'session_attendance',
  'Backfill: session attendance XP',
  s.start_time
FROM session_players sp
JOIN sessions s ON sp.session_id = s.id
WHERE sp.player_id = 'player-thelaw-001'
  AND sp.attendance_status IN ('present', 'late')
  AND NOT EXISTS (
    SELECT 1 FROM xp_transactions xt 
    WHERE xt.player_id = 'player-thelaw-001' 
      AND xt.source = 'session_attendance' 
      AND xt.session_id = sp.session_id
  );

-- Step 2: Award profile_complete XP (one-time, 15 XP) if not already awarded
INSERT INTO xp_transactions (player_id, xp_amount, source, description)
SELECT 'player-thelaw-001', 15, 'profile_complete', 'Backfill: profile complete XP'
WHERE NOT EXISTS (
  SELECT 1 FROM xp_transactions 
  WHERE player_id = 'player-thelaw-001' AND source = 'profile_complete'
);

-- Step 3: Award first_community_post XP (one-time, 10 XP) if player has a post and not already awarded
INSERT INTO xp_transactions (player_id, xp_amount, source, description)
SELECT 'player-thelaw-001', 10, 'first_community_post', 'Backfill: first community post XP'
WHERE EXISTS (
  SELECT 1 FROM posts WHERE author_id = (
    SELECT u.id FROM users u 
    JOIN players p ON u.player_id = p.id 
    WHERE p.id = 'player-thelaw-001' 
    LIMIT 1
  )
)
AND NOT EXISTS (
  SELECT 1 FROM xp_transactions 
  WHERE player_id = 'player-thelaw-001' AND source = 'first_community_post'
);

-- Step 4: Recalculate total_xp from all transactions
UPDATE players 
SET total_xp = (
  SELECT COALESCE(SUM(xp_amount), 0) 
  FROM xp_transactions 
  WHERE player_id = 'player-thelaw-001'
)
WHERE id = 'player-thelaw-001';

-- Step 5: Recalculate players.level based on cumulative player_level_thresholds
-- Level is determined by the highest threshold level where cumulative XP >= total_xp
UPDATE players
SET level = (
  WITH cumulative AS (
    SELECT
      level,
      SUM(xp_required) OVER (ORDER BY level ASC) AS cumulative_xp
    FROM player_level_thresholds
  )
  SELECT COALESCE(MAX(c.level), 1)
  FROM cumulative c
  WHERE c.cumulative_xp <= (
    SELECT total_xp FROM players WHERE id = 'player-thelaw-001'
  )
)
WHERE id = 'player-thelaw-001';

-- Step 6: Verify result
SELECT id, total_xp, level FROM players WHERE id = 'player-thelaw-001';

-- Step 7: Show XP transaction summary
SELECT source, COUNT(*) as count, SUM(xp_amount) as total_xp
FROM xp_transactions
WHERE player_id = 'player-thelaw-001'
GROUP BY source
ORDER BY source;
