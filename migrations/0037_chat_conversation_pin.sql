-- Task #1318: Per-conversation pin column for direct/group chats.
--
-- Players and coaches can already pin chat-rooms; this column extends
-- the same affordance to academy/personal conversations
-- (player↔player, coach↔player, group, etc.). The existing
-- `mute_until` column on the same table covers the matching mute
-- functionality; a far-future timestamp (year 9999) is used as the
-- sentinel for "Forever".

ALTER TABLE "conversation_participants"
  ADD COLUMN IF NOT EXISTS "pinned_at" timestamp;

-- Helps the conversation list endpoint look up a participant's
-- pin/mute state by (conversation, participant) when stitching
-- per-user state into the response.
CREATE INDEX IF NOT EXISTS "conversation_participants_conv_player_idx"
  ON "conversation_participants" ("conversation_id", "player_id")
  WHERE "player_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "conversation_participants_conv_coach_idx"
  ON "conversation_participants" ("conversation_id", "coach_id")
  WHERE "coach_id" IS NOT NULL;
