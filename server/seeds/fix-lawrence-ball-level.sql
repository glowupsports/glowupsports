-- Fix: Reset Lawrence (player-thelaw-001) ball_level from 'glow' to 'green'
-- Rationale: The Law is a test account used to experience the green-ball player journey.
-- Resetting to 'green' aligns with cleared XP/level (task #376) and ensures GREEN_3
-- curriculum skills appear in the skill drilldown.
-- Safe to run multiple times (idempotent).

UPDATE players
SET ball_level = 'green'
WHERE id = 'player-thelaw-001'
  AND ball_level != 'green';

-- Verification query (expect 1 row with ball_level = 'green'):
-- SELECT id, name, ball_level FROM players WHERE id = 'player-thelaw-001';
