-- Task #692 step 1 — Move "package templates" off the legacy V1 table.
--
-- Creates `credit_package_templates` (V2 name, identical shape to the
-- V1 `package_templates` table) and copies every existing row across so the
-- live `/api/billing/package-templates` API can switch over without any
-- frontend or data change.
--
-- The legacy `package_templates` table is left in place; it becomes inert
-- once the storage layer in this PR points at the new table. It will be
-- dropped together with `packages`, `credit_transactions` and
-- `credit_shadow_diff` in the final phase of Task #692.
--
-- Idempotent: every statement uses IF NOT EXISTS / ON CONFLICT so it is
-- safe to re-apply.

-- ---------- table ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_package_templates (
  id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id     VARCHAR NOT NULL REFERENCES academies(id),

  name           TEXT    NOT NULL,
  description    TEXT,

  credits        INTEGER NOT NULL,
  price          NUMERIC NOT NULL,
  currency       TEXT    DEFAULT 'AED',

  validity_days  INTEGER DEFAULT 90,
  session_type   TEXT,

  is_active      BOOLEAN DEFAULT TRUE,
  sort_order     INTEGER DEFAULT 0,

  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_package_templates_academy_idx
  ON credit_package_templates (academy_id);

-- ---------- data copy ------------------------------------------------------
-- Copy every existing row from the legacy table. ON CONFLICT keeps the
-- migration safe to re-run; ids are preserved so any in-memory references
-- (e.g. cached SeriesAddPlayerModal selections) stay valid.
INSERT INTO credit_package_templates (
  id, academy_id, name, description,
  credits, price, currency,
  validity_days, session_type,
  is_active, sort_order,
  created_at, updated_at
)
SELECT
  id, academy_id, name, description,
  credits, price, currency,
  validity_days, session_type,
  is_active, sort_order,
  created_at, updated_at
FROM package_templates
ON CONFLICT (id) DO NOTHING;
