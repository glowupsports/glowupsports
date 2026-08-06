-- Migration: Re-enable Row-Level Security on tables added since migration 0012
-- Task: #2146
-- Date: 2026-08-06
--
-- Background:
-- Supabase's database linter reported 162 tables with RLS disabled and 24 tables
-- with sensitive columns exposed (token, password, session_id) via PostgREST.
-- Migration 0012 (Task #432, April 2026) fixed all 206 tables that existed then.
-- Since April, ~160 new tables were added to the schema without RLS being enabled.
--
-- Why this is safe with zero app code changes:
--   - The Express server uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely.
--   - The mobile/web app talks ONLY to the Express API, never directly to PostgREST.
--   - No Supabase anon key or client SDK is used in any frontend code.
--   - Enabling RLS with no policies = deny-all for anon/JWT PostgREST access
--     while service role remains fully unaffected.
--
-- This block is idempotent: it only targets tables where rowsecurity = false.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$;

-- Verify: this should return 0 after running the block above
-- SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;
