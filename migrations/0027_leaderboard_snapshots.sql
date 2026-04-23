-- Task #1035 — Country Leaderboards Per Sport
-- Stores weekly snapshots of leaderboard ranks so we can show a small +/-
-- delta vs last week per player without recomputing history on the fly.
--
-- One row per (sport, scope, country, player, week). `country` is the
-- empty string for global scope so the unique index works under PG.

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  sport text NOT NULL,
  scope text NOT NULL,
  country text NOT NULL DEFAULT '',
  player_id varchar NOT NULL,
  rank integer NOT NULL,
  snapshot_week date NOT NULL,
  created_at timestamp DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_snapshots_unique_idx
  ON leaderboard_snapshots (sport, scope, country, player_id, snapshot_week);

CREATE INDEX IF NOT EXISTS leaderboard_snapshots_lookup_idx
  ON leaderboard_snapshots (sport, scope, country, snapshot_week);
