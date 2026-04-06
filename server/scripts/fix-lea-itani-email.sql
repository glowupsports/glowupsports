-- ============================================================================
-- One-time fix: Update Lea Itani's user account email (applied 2026-04-06)
-- ============================================================================
-- WHAT: Lea's user.email was set to a temporary placeholder during account
--       restoration. Update it to match the rest of the Itani family so all
--       3 members (Mohamad, Lynne, Lea) appear together in the Family Lobby
--       via the byEmail lookup.
--
-- STATUS: Already executed against Supabase. DO NOT RE-RUN.
-- ============================================================================

UPDATE users
SET email = 'itani.mohd@gmail.com'
WHERE username = 'lea'
  AND email = 'lea.itani.restore@glowupsports.temp';
-- Result: 1 row updated (id: 4f96c61c-a868-4984-9faa-470d16e10e7b)

-- VERIFICATION (already confirmed):
-- SELECT id, username, email FROM users WHERE username = 'lea';
-- Expected: lea | itani.mohd@gmail.com
