#!/bin/bash
# Sync database schema to Supabase
# This script runs drizzle-kit push with SUPABASE_DATABASE_URL

echo "🔄 Syncing database schema to Supabase..."

# Override DATABASE_URL with SUPABASE_DATABASE_URL for drizzle-kit
export DATABASE_URL="$SUPABASE_DATABASE_URL"

# Run drizzle-kit push
npx drizzle-kit push --force

echo "✅ Schema sync complete!"
