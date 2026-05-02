-- Task #1565 — Post-session check-in: session_checkins table
--
-- Stores player energy/mood/notes submitted after a completed session.
-- The unique(session_id, player_id) constraint makes upserts idempotent
-- so re-submitting a check-in updates the existing row instead of
-- creating a duplicate.
--
-- All statements use IF NOT EXISTS / ON CONFLICT so this migration is
-- safe to re-run on environments that already have the table.

CREATE TABLE IF NOT EXISTS session_checkins (
  id            VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    VARCHAR     NOT NULL,
  player_id     VARCHAR     NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  energy_level  INTEGER     NOT NULL CHECK (energy_level BETWEEN 1 AND 5),
  mood          INTEGER     NOT NULL CHECK (mood BETWEEN 1 AND 5),
  notes         TEXT,
  created_at    TIMESTAMP   DEFAULT NOW(),
  CONSTRAINT session_checkins_session_player_unique
    UNIQUE (session_id, player_id)
);

CREATE INDEX IF NOT EXISTS session_checkins_player_idx
  ON session_checkins (player_id);

CREATE INDEX IF NOT EXISTS session_checkins_session_idx
  ON session_checkins (session_id);
