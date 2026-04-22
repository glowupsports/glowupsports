-- Task #973: Prevent duplicate friend requests by adding a unique index on
-- the unordered (player1_id, player2_id) pair, scoped to friend connections.
--
-- Applied via:
--   psql "$SUPABASE_DATABASE_URL" -f server/migrations/20260422_player_connections_friend_unique.sql
--
-- Idempotency: Step 1 dedup is safe to re-run (after dedup there's at most one
-- row per pair, so the CTE selects nothing). Step 2 uses CREATE UNIQUE INDEX
-- IF NOT EXISTS so reruns are no-ops.

BEGIN;

-- Step 1: De-duplicate existing friend connections per unordered pair.
-- Precedence:  accepted > pending > everything else.
-- Tie-breakers within the same status: keep the oldest row (smallest
-- created_at, then smallest id) so behaviour is deterministic.
--
-- Note: buildFriendStatusMap uses a viewer-relative precedence
-- (accepted > pending_received > pending_sent), but at the database level
-- there is no "viewer" — both rows of a duplicated pending pair would be
-- pending_sent for one player and pending_received for the other, so the
-- viewer-relative tie-break can't be expressed here. Collapsing all
-- pendings to "oldest wins" is safe: whichever player ends up as the
-- requester for the surviving row, the other side simply sees a pending
-- request to act on (which is the actionable outcome buildFriendStatusMap
-- already prefers).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        LEAST(player1_id, player2_id),
        GREATEST(player1_id, player2_id)
      ORDER BY
        CASE status
          WHEN 'accepted' THEN 0
          WHEN 'pending'  THEN 1
          ELSE 2
        END,
        COALESCE(accepted_at, created_at, NOW()) ASC,
        created_at ASC NULLS LAST,
        id ASC
    ) AS rn
  FROM player_connections
  WHERE connection_type = 'friend'
)
DELETE FROM player_connections
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Add the unique index that prevents future duplicates.
-- Scoped to connection_type = 'friend' so non-friend rows (rivals, training
-- partners, future types) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS player_connections_friend_pair_unique
  ON player_connections (
    LEAST(player1_id, player2_id),
    GREATEST(player1_id, player2_id)
  )
  WHERE connection_type = 'friend';

COMMIT;
