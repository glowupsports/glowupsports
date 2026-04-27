-- Task #1398 — Indexes that back the Player Dashboard hot endpoints.
--
-- Added by the perf pass that collapsed god-endpoint HTTP fan-out into
-- in-process dispatch and bounded the discovery scan. Each index here
-- maps to one (or more) verified slow query in the player dashboard
-- screens (Community, Leaderboard, Profile, Sessions, Find a Match).
--
-- All statements use IF NOT EXISTS so this migration is safe to re-run
-- on environments that already received them via `db:push` from the
-- updated shared/schema.ts. Index naming follows the existing
-- `<table>_<cols>_idx` convention used elsewhere in the schema.

-- ---------------------------------------------------------------------
-- 1. Discovery / "Find a Match" — same-country bucket sorted by MMR
-- ---------------------------------------------------------------------
-- /api/social/discovery/players Bucket 1 filters players by `country`
-- and ranks by `ABS(glow_mmr - me.mmr)`. The previous code pulled up to
-- 200 same-country rows and re-sorted in JS. After this migration the
-- query can be both bounded and ordered in SQL.
CREATE INDEX IF NOT EXISTS players_country_glow_mmr_idx
  ON players (country, glow_mmr);

-- ---------------------------------------------------------------------
-- 2. Discovery — academy-scoped fallback (Bucket 2)
-- ---------------------------------------------------------------------
-- Existing `players_academy_status_idx` covers the (academy_id, status)
-- predicate but nothing covers academy + ordering. Add a (academy_id,
-- glow_mmr) composite to support same-academy ranked discovery and
-- academy-scoped leaderboards alike.
CREATE INDEX IF NOT EXISTS players_academy_glow_mmr_idx
  ON players (academy_id, glow_mmr);

-- ---------------------------------------------------------------------
-- 3. Leaderboard — global / country / academy ordering
-- ---------------------------------------------------------------------
-- The Glow Leaderboard endpoint orders by glow_score, total_xp, or
-- glow_mmr depending on the selected category. Sequential scans on
-- 100k-row players tables are the dominant cost. Single-column DESC
-- indexes give Postgres a covering ORDER BY at the storage layer.
CREATE INDEX IF NOT EXISTS players_glow_score_desc_idx
  ON players (glow_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS players_total_xp_desc_idx
  ON players (total_xp DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS players_glow_mmr_desc_idx
  ON players (glow_mmr DESC NULLS LAST);

-- Country leaderboard: support the (country, glow_score DESC) sort path.
CREATE INDEX IF NOT EXISTS players_country_glow_score_idx
  ON players (country, glow_score DESC NULLS LAST);

-- ---------------------------------------------------------------------
-- 4. Sessions list — /api/play/sessions and /api/player/me/sessions
-- ---------------------------------------------------------------------
-- The Find a Match feed and the Schedule god-endpoint both filter
-- sessions by `academy_id` AND `start_time`. The existing schema has
-- no compound index here; queries fall back to (start_time) heap
-- filters. Add (academy_id, start_time) and (start_time) DESC for the
-- "upcoming for any academy" path.
CREATE INDEX IF NOT EXISTS sessions_academy_start_idx
  ON sessions (academy_id, start_time);

CREATE INDEX IF NOT EXISTS sessions_start_time_idx
  ON sessions (start_time);

-- Status filtering is also common (exclude cancelled). Compound covers
-- the most-frequent shape: "active sessions for academy X, ordered by
-- time".
CREATE INDEX IF NOT EXISTS sessions_academy_status_start_idx
  ON sessions (academy_id, status, start_time);

-- ---------------------------------------------------------------------
-- 5. Coaching series — public/marketplace listings
-- ---------------------------------------------------------------------
-- The Find a Match screen surfaces public drop-in series. Today the
-- query scans coaching_series sequentially and filters in memory.
-- (academy_id, is_public) lets Postgres use an index-only scan for
-- the dominant access pattern.
CREATE INDEX IF NOT EXISTS coaching_series_academy_public_idx
  ON coaching_series (academy_id, is_public);

CREATE INDEX IF NOT EXISTS coaching_series_public_status_idx
  ON coaching_series (is_public, status);

-- ---------------------------------------------------------------------
-- 6. Posts — Community feed academy + chronological pagination
-- ---------------------------------------------------------------------
-- `posts_created_idx` exists on (created_at) only, which forces a
-- filter step when scoping to a single academy. Most reads from the
-- Community god-endpoint scope to one academy and order by recency.
CREATE INDEX IF NOT EXISTS posts_academy_created_idx
  ON posts (academy_id, created_at DESC);

-- Group feeds follow the same pattern.
CREATE INDEX IF NOT EXISTS posts_group_created_idx
  ON posts (group_id, created_at DESC);

-- Profile screen "my posts" section: order an author's posts by recency.
CREATE INDEX IF NOT EXISTS posts_author_created_idx
  ON posts (author_id, created_at DESC);
