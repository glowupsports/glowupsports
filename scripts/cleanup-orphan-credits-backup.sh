#!/usr/bin/env bash
# Pre-cleanup backup helper for Task #623.
#
# Generates a FULL-COLUMN restorable backup of credit_transactions and
# session_players. Uses CSV with COPY (works around pg_dump version mismatch
# between local pg16 client and Supabase pg17 server, AND captures every
# column even if the schema evolves).
#
# Usage:
#   bash scripts/cleanup-orphan-credits-backup.sh
#
# Output:
#   .local/backup-credit_transactions-{YYYY-MM-DD}.csv
#   .local/backup-session_players-{YYYY-MM-DD}.csv
#   .local/backup-pre-cleanup-{YYYY-MM-DD}.sql  (restore-runner script)
#
# Restore (full re-import; manually clear target tables first if needed):
#   PGOPTIONS="-csearch_path=public" psql "$SUPABASE_DATABASE_URL" \
#     -f .local/backup-pre-cleanup-{YYYY-MM-DD}.sql

set -euo pipefail

if [[ -z "${SUPABASE_DATABASE_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DATABASE_URL env var not set" >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d)"
mkdir -p .local
CT_CSV=".local/backup-credit_transactions-${DATE}.csv"
SP_CSV=".local/backup-session_players-${DATE}.csv"
SQLBK=".local/backup-pre-cleanup-${DATE}.sql"

echo "Backing up to:"
echo "  $CT_CSV  (full-column CSV via COPY)"
echo "  $SP_CSV  (full-column CSV via COPY)"
echo "  $SQLBK   (restore-runner)"

PGOPTIONS="-csearch_path=public" psql "$SUPABASE_DATABASE_URL" \
  -c "\COPY credit_transactions TO '$CT_CSV' WITH (FORMAT csv, HEADER true)"
PGOPTIONS="-csearch_path=public" psql "$SUPABASE_DATABASE_URL" \
  -c "\COPY session_players TO '$SP_CSV' WITH (FORMAT csv, HEADER true)"

# Build a restore-runner that uses \COPY FROM with HEADER MATCH so column
# order and types are taken from the CSV header — this preserves ALL columns
# regardless of schema evolution.
cat > "$SQLBK" <<EOF
-- Pre-cleanup backup restore-runner for Task #623
-- Created: $(date -u +%Y-%m-%dT%H:%M:%SZ)
-- Restore command:
--   PGOPTIONS="-csearch_path=public" psql "\$SUPABASE_DATABASE_URL" -f $SQLBK
--
-- Companion CSVs (full-column dumps via COPY):
--   $CT_CSV
--   $SP_CSV

SET search_path TO public;

\\echo 'Restoring credit_transactions from $CT_CSV ...'
\\COPY credit_transactions FROM '$CT_CSV' WITH (FORMAT csv, HEADER match)

\\echo 'Restoring session_players from $SP_CSV ...'
\\COPY session_players FROM '$SP_CSV' WITH (FORMAT csv, HEADER match)
EOF

echo "Done."
ls -la "$CT_CSV" "$SP_CSV" "$SQLBK"
