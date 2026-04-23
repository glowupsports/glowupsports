-- Task #1047 — @mentions in world/country chat rooms.
-- Records players mentioned in a room message so chips can be made tappable
-- (link to the player's public profile) and so we can fan out notifications.

CREATE TABLE IF NOT EXISTS chat_room_message_mentions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id varchar NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  player_id varchar NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  handle varchar(64) NOT NULL,
  created_at timestamp DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_room_msg_mentions_unique
  ON chat_room_message_mentions (message_id, player_id);

CREATE INDEX IF NOT EXISTS chat_room_msg_mentions_msg_idx
  ON chat_room_message_mentions (message_id);

CREATE INDEX IF NOT EXISTS chat_room_msg_mentions_player_idx
  ON chat_room_message_mentions (player_id);
