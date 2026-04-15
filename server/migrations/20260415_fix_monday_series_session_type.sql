-- Fix coaching_series 3a92cc9f: session_type private → group
-- Series: "Group Session - Mon 14:00" has players Maciej Drozd, Filip Tomasz Wozniak,
-- Alex Lykov, Akshane Sawjiani, Anarchist, and others — clearly a group session.
-- Only the series title was updated by the coach previously; session_type was never saved.
-- Olaf Rietveld's Sunday private series (d4669414-...) is NOT touched.

BEGIN;

-- Step 1: Fix the coaching_series record itself
UPDATE coaching_series
SET session_type = 'group'
WHERE id = '3a92cc9f-9e88-4634-ae1f-94d74eb5f555'
  AND session_type != 'group';

-- Step 2: Fix all future scheduled sessions linked to this series
-- Uses both series_id and recurring_group_id for defensive coverage
-- (older sessions may use recurring_group_id = series.id as their linkage key)
UPDATE sessions
SET session_type = 'group'
WHERE (series_id = '3a92cc9f-9e88-4634-ae1f-94d74eb5f555'
       OR recurring_group_id = '3a92cc9f-9e88-4634-ae1f-94d74eb5f555')
  AND status = 'scheduled'
  AND start_time > NOW()
  AND session_type != 'group';

-- Verify: confirm series is now 'group'
SELECT id, title, session_type, status
FROM coaching_series
WHERE id = '3a92cc9f-9e88-4634-ae1f-94d74eb5f555';

-- Verify: confirm no future sessions remain with wrong type
SELECT COUNT(*) AS remaining_wrong_type
FROM sessions
WHERE (series_id = '3a92cc9f-9e88-4634-ae1f-94d74eb5f555'
       OR recurring_group_id = '3a92cc9f-9e88-4634-ae1f-94d74eb5f555')
  AND status = 'scheduled'
  AND start_time > NOW()
  AND session_type != 'group';

-- Safety check: Olaf's Sunday private series must be untouched
SELECT id, title, session_type, status
FROM coaching_series
WHERE id LIKE 'd4669414%';

COMMIT;
