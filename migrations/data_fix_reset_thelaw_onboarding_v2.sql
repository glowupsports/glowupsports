-- Data Fix: Reset onboarding_completed for player-thelaw-001
-- Date: 2026-03-18
-- Task: #52
-- Reason: Player was stuck in completed onboarding state, preventing re-entry of onboarding flow.
-- Status: Applied (confirmed onboarding_completed = f via SELECT)

UPDATE players SET onboarding_completed = false WHERE id = 'player-thelaw-001';

-- Verification:
-- SELECT id, name, onboarding_completed FROM players WHERE id = 'player-thelaw-001';
-- Expected: onboarding_completed = f
