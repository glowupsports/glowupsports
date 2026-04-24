-- Task #1183 — "What's New" carousel cache.
-- Server-side cache for the AI-generated release-notes slides served by
-- GET /api/release-notes. Once generated, the slides for a given
-- (version, role, locale) tuple never change, so the cache is permanent.

CREATE TABLE IF NOT EXISTS "release_notes_cache" (
  "id"            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "version"       text   NOT NULL,
  "role"          text   NOT NULL,            -- player | parent | coach | owner
  "locale"        text   NOT NULL,            -- en | nl | id | ar
  "from_version"  text,                       -- previous version we diffed against
  "slides"        jsonb  NOT NULL,            -- [{ id, icon, title, body }]
  "commit_sha"    text,                       -- HEAD sha at generation time
  "generated_at"  timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "release_notes_cache_unique_idx"
  ON "release_notes_cache" ("version", "role", "locale");
