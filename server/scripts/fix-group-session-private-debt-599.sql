-- Fix #599: Correct debt transactions where credit_type does not match session_type
-- Root cause: auto-completion code in pushNotifications.ts had a wrong fallback to
--             'private' for any session_type not matching includes("semi"/"group").
-- Safe to run multiple times (UPDATEs are idempotent on already-correct rows).
-- SCOPE: Only touches DEBT records (no package association, debt-style reasons).
--        Does NOT touch session_booking / session_consumed (package-consumption flows).

-- Normalisation rules (mirrors normalizeType() in ensureCreditProcessed, storage.ts):
--   session_type IN ('semi_private','semi','semi_private_adjusted') -> 'semi_private'
--   session_type IN ('private','private_adjusted')                  -> 'private'
--   anything else (group, group_adjusted, null, unknown)            -> 'group'

-- STEP 1: Fix the two specific Amelia Michalski debt transactions
UPDATE credit_transactions
SET credit_type = 'group'
WHERE id IN (
  'c76e5080-5613-49ae-b600-52736e3178b1',
  'debt-auto-eae71802-4354-4430-93f0-a869cb5e472b-90e184bf-3d41-478e-8e62-ea58ed4434d7'
)
  AND credit_type = 'private';

-- STEP 2: Fix ALL debt transactions where credit_type='private' but session is group/group_adjusted
-- Restricted to debt-only rows (no package association).
UPDATE credit_transactions ct
SET credit_type = 'group'
FROM sessions s
WHERE ct.session_id = s.id
  AND ct.amount < 0
  AND ct.credit_type = 'private'
  AND s.session_type IN ('group', 'group_adjusted')
  AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
  AND ct.package_id IS NULL
  AND (ct.metadata->>'packageId') IS NULL
  AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
  AND COALESCE(ct.metadata->>'settled', 'false') != 'true';

-- STEP 3: Fix ALL debt transactions where credit_type='group' but session is private/private_adjusted
-- Restricted to debt-only rows (no package association).
UPDATE credit_transactions ct
SET credit_type = 'private'
FROM sessions s
WHERE ct.session_id = s.id
  AND ct.amount < 0
  AND ct.credit_type = 'group'
  AND s.session_type IN ('private', 'private_adjusted')
  AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
  AND ct.package_id IS NULL
  AND (ct.metadata->>'packageId') IS NULL
  AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
  AND COALESCE(ct.metadata->>'settled', 'false') != 'true';

-- STEP 4: Fix debt transactions where credit_type='private' but session is semi_private
UPDATE credit_transactions ct
SET credit_type = 'semi_private'
FROM sessions s
WHERE ct.session_id = s.id
  AND ct.amount < 0
  AND ct.credit_type = 'private'
  AND s.session_type IN ('semi_private', 'semi', 'semi_private_adjusted')
  AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
  AND ct.package_id IS NULL
  AND (ct.metadata->>'packageId') IS NULL
  AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
  AND COALESCE(ct.metadata->>'settled', 'false') != 'true';

-- STEP 5: Fix debt transactions where credit_type='group' but session is semi_private
UPDATE credit_transactions ct
SET credit_type = 'semi_private'
FROM sessions s
WHERE ct.session_id = s.id
  AND ct.amount < 0
  AND ct.credit_type = 'group'
  AND s.session_type IN ('semi_private', 'semi', 'semi_private_adjusted')
  AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
  AND ct.package_id IS NULL
  AND (ct.metadata->>'packageId') IS NULL
  AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
  AND COALESCE(ct.metadata->>'settled', 'false') != 'true';

-- VERIFICATION: Comprehensive check for all remaining debt mismatches across all credit types
-- Should return 0 rows after fix. All predicates match the update scope above.
SELECT
  ct.credit_type AS stored_type,
  CASE
    WHEN s.session_type IN ('semi_private', 'semi', 'semi_private_adjusted') THEN 'semi_private'
    WHEN s.session_type IN ('private', 'private_adjusted') THEN 'private'
    ELSE 'group'
  END AS expected_type,
  s.session_type,
  ct.reason,
  COUNT(*) AS mismatch_count
FROM credit_transactions ct
JOIN sessions s ON s.id = ct.session_id
WHERE ct.amount < 0
  AND ct.reason IN ('session_debt', 'session_join_debt', 'session_unpaid')
  AND ct.package_id IS NULL
  AND (ct.metadata->>'packageId') IS NULL
  AND COALESCE(ct.metadata->>'cancelled', 'false') != 'true'
  AND COALESCE(ct.metadata->>'settled', 'false') != 'true'
  AND ct.credit_type IS DISTINCT FROM (
    CASE
      WHEN s.session_type IN ('semi_private', 'semi', 'semi_private_adjusted') THEN 'semi_private'
      WHEN s.session_type IN ('private', 'private_adjusted') THEN 'private'
      ELSE 'group'
    END
  )
GROUP BY ct.credit_type, expected_type, s.session_type, ct.reason
ORDER BY mismatch_count DESC;
