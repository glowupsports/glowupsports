-- Task #1649 — player_health_snapshots table
--
-- Persists wellness summaries submitted by players via POST /api/player/me/health-snapshot.
-- Replaces the previous in-memory Map so recovery history survives server restarts.
--
-- All statements use IF NOT EXISTS so this migration is safe to re-run on
-- environments that already have the table (e.g., after a direct db push).

CREATE TABLE IF NOT EXISTS player_health_snapshots (
  id               VARCHAR     PRIMARY KEY DEFAULT gen_random_uuid()::text,
  player_id        VARCHAR     NOT NULL,
  sleep_quality    TEXT,
  recovery_status  TEXT,
  steps_today      INTEGER,
  recorded_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_health_snapshots_player_idx
  ON player_health_snapshots (player_id);
