#!/bin/bash
set -e

# Task #1132 — Family A: ensure family_groups + family_members exist on every
# environment before app code that references them runs. Idempotent — uses
# CREATE TABLE IF NOT EXISTS so re-runs are no-ops.
DB_URL="${SUPABASE_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -n "$DB_URL" ] && command -v psql >/dev/null 2>&1; then
  echo "[post-merge] ensuring family_groups + family_members tables..."
  psql "$DB_URL" <<'SQL'
CREATE TABLE IF NOT EXISTS "family_groups" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_by_player_id" varchar REFERENCES "players"("id"),
  "name" text,
  "archived_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "family_members" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "family_group_id" varchar NOT NULL REFERENCES "family_groups"("id"),
  "player_id" varchar NOT NULL REFERENCES "players"("id"),
  "role_label" text DEFAULT 'member',
  "added_by_player_id" varchar REFERENCES "players"("id"),
  "added_with_pin" boolean DEFAULT false,
  "joined_at" timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "family_members_group_player_unique"
  ON "family_members" ("family_group_id", "player_id");
CREATE INDEX IF NOT EXISTS "family_members_by_player_idx"
  ON "family_members" ("player_id");
SQL

  # Task #1135 — Family D: family_chat schema additions on community_groups.
  # - Make academy_id nullable (families are academy-independent — Free Players
  #   in a family still get a chat).
  # - Add family_group_id column + index so we can find the chat for a family.
  # Idempotent: ALTER ... DROP NOT NULL is a no-op once already nullable;
  # ADD COLUMN IF NOT EXISTS is safe to re-run.
  echo "[post-merge] ensuring community_groups family-chat columns..."
  psql "$DB_URL" <<'SQL'
ALTER TABLE "community_groups"
  ALTER COLUMN "academy_id" DROP NOT NULL;
ALTER TABLE "community_groups"
  ADD COLUMN IF NOT EXISTS "family_group_id" varchar;
CREATE INDEX IF NOT EXISTS "community_groups_family_idx"
  ON "community_groups" ("family_group_id");
-- Task #1135 — guarantee at most one community_groups row per family.
-- Partial unique so non-family rows (NULL family_group_id) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "community_groups_family_group_id_unique"
  ON "community_groups" ("family_group_id")
  WHERE "family_group_id" IS NOT NULL;
SQL

  echo "[post-merge] running family-groups backfill (idempotent)..."
  npx tsx scripts/backfill-family-groups.ts || echo "[post-merge] backfill returned non-zero — continuing"
else
  echo "[post-merge] no DATABASE_URL or psql — skipping family_groups setup"
fi

echo "[post-merge] Post-merge setup complete."
