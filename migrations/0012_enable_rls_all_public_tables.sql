-- Migration: Enable Row-Level Security on all public schema tables
-- Task: #432
-- Date: 2026-04-08
--
-- Background:
-- Supabase reported a CRITICAL security alert for two issues:
--   1. rls_disabled_in_public: All 206 public tables were accessible without restriction
--      via PostgREST (anon key access could read/write/delete all data).
--   2. sensitive_columns_exposed: Columns like users.password, users.email,
--      players.phone, players.parent_email, players.attendance_share_token,
--      coaches.email, coaches.phone, credit_transactions, packages were exposed.
--
-- Why this is safe with zero app code changes:
--   - The Express server uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely.
--   - The mobile app talks ONLY to the Express API, never directly to PostgREST.
--   - No Supabase anon key or client SDK is used in any frontend code.
--   - Enabling RLS with no policies = deny-all for anon/JWT PostgREST access
--     while service role remains fully unaffected.
--
-- This migration was applied directly via psql against the Supabase database.
-- Verification: SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;
-- Result after applying: 0 (all 206 tables now have rowsecurity = true)

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
