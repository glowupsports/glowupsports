-- Data Fix: Reset onboarding for 'thelaw' player account
-- Date: 2026-03-18
-- Task: Reset onboarding_completed flag for the player account with username 'thelaw'
--       so the user can go through the updated onboarding flow from the beginning.
--
-- Verification query (before):
-- SELECT p.id, p.name, p.onboarding_completed
-- FROM players p
-- JOIN users u ON u.player_id = p.id
-- WHERE u.username = 'thelaw';
--
-- Expected before: onboarding_completed = true
-- Expected after:  onboarding_completed = false

UPDATE players
SET onboarding_completed = false
WHERE id = (
    SELECT player_id
    FROM users
    WHERE username = 'thelaw'
);

-- Rollback:
-- UPDATE players
-- SET onboarding_completed = true
-- WHERE id = (SELECT player_id FROM users WHERE username = 'thelaw');
