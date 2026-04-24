#!/usr/bin/env bash
# scripts/db-query.sh
#
# Canonical wrapper for running queries against the REAL Supabase database.
#
# WHY THIS EXISTS:
#   The local `executeSql` / `code_execution` SQL tool queries a LOCAL sandbox
#   database, NOT Supabase. Using it for "real" data will silently give you the
#   wrong answer. Always go through Supabase for any data inspection, debugging,
#   migration, or one-off fix. See ../DATABASE.md for the full rule.
#
# USAGE:
#   bash scripts/db-query.sh -c "select 1"
#   bash scripts/db-query.sh -c "select count(*) from users"
#   bash scripts/db-query.sh -f some_file.sql
#   bash scripts/db-query.sh           # opens an interactive psql shell
#
# All arguments are forwarded to psql.

set -euo pipefail

if [[ -z "${SUPABASE_DATABASE_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DATABASE_URL is not set." >&2
  echo "       This is the connection string for the REAL Supabase database." >&2
  echo "       Set it in Replit Secrets before running database queries." >&2
  echo "       See DATABASE.md for details." >&2
  exit 1
fi

exec psql "$SUPABASE_DATABASE_URL" "$@"
