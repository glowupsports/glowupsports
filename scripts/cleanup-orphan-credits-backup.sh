#!/usr/bin/env bash
# Pre-cleanup backup helper for Task #623.
#
# Generates an INSERT-style SQL backup of credit_transactions and
# session_players. Safe to use even when client/server pg_dump versions
# differ (Supabase often runs newer postgres).
#
# Usage:
#   bash scripts/cleanup-orphan-credits-backup.sh
#
# Output:
#   .local/backup-pre-cleanup-{YYYY-MM-DD}.sql
#   .local/backup-credit_transactions-{YYYY-MM-DD}.csv
#   .local/backup-session_players-{YYYY-MM-DD}.csv

set -euo pipefail

if [[ -z "${SUPABASE_DATABASE_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DATABASE_URL env var not set" >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d)"
mkdir -p .local
SQLBK=".local/backup-pre-cleanup-${DATE}.sql"
CT_CSV=".local/backup-credit_transactions-${DATE}.csv"
SP_CSV=".local/backup-session_players-${DATE}.csv"

echo "Backing up to:"
echo "  $SQLBK"
echo "  $CT_CSV"
echo "  $SP_CSV"

# Raw CSV exports (fast, easy to spot-check)
PGOPTIONS="-csearch_path=public" psql "$SUPABASE_DATABASE_URL" \
  -c "\COPY credit_transactions TO '$CT_CSV' WITH (FORMAT csv, HEADER true)"
PGOPTIONS="-csearch_path=public" psql "$SUPABASE_DATABASE_URL" \
  -c "\COPY session_players TO '$SP_CSV' WITH (FORMAT csv, HEADER true)"

# INSERT-style SQL backup (re-runnable via psql -f)
{
  echo "-- Pre-cleanup backup for Task #623"
  echo "-- Created: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
  echo "-- ===== credit_transactions ====="
} > "$SQLBK"

PGOPTIONS="-csearch_path=public" psql "$SUPABASE_DATABASE_URL" -At -c "
SELECT 'INSERT INTO credit_transactions(id, player_id, package_id, amount, reason, metadata, created_at) VALUES (' ||
  quote_literal(id) || ',' ||
  quote_nullable(player_id) || ',' ||
  quote_nullable(package_id) || ',' ||
  amount || ',' ||
  quote_literal(reason) || ',' ||
  COALESCE(quote_literal(metadata::text) || '::jsonb', 'NULL') || ',' ||
  COALESCE(quote_literal(created_at::text) || '::timestamp', 'NULL') ||
  ') ON CONFLICT (id) DO NOTHING;'
FROM credit_transactions
ORDER BY created_at;
" >> "$SQLBK"

{
  echo ""
  echo "-- ===== session_players ====="
} >> "$SQLBK"

PGOPTIONS="-csearch_path=public" psql "$SUPABASE_DATABASE_URL" -At -c "
SELECT 'INSERT INTO session_players(id, session_id, player_id, attendance_status, late_minutes, absence_reason, is_guest, xp_awarded, notes, credit_deducted_at, credit_transaction_id, join_type) VALUES (' ||
  quote_literal(id) || ',' ||
  quote_literal(session_id) || ',' ||
  quote_literal(player_id) || ',' ||
  quote_nullable(attendance_status) || ',' ||
  COALESCE(late_minutes::text, 'NULL') || ',' ||
  quote_nullable(absence_reason) || ',' ||
  COALESCE(is_guest::text, 'NULL') || ',' ||
  COALESCE(xp_awarded::text, 'NULL') || ',' ||
  quote_nullable(notes) || ',' ||
  COALESCE(quote_literal(credit_deducted_at::text) || '::timestamp', 'NULL') || ',' ||
  quote_nullable(credit_transaction_id) || ',' ||
  quote_nullable(join_type) ||
  ') ON CONFLICT (id) DO NOTHING;'
FROM session_players;
" >> "$SQLBK"

echo "Done."
ls -la "$SQLBK" "$CT_CSV" "$SP_CSV"
