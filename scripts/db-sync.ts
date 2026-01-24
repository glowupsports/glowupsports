import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const TABLES_TO_SYNC = [
  'users', 'academies', 'academy_settings', 'academy_pricing', 'locations', 'courts',
  'billing_accounts', 'coaches', 'coach_academy_memberships', 'coach_availability',
  'coach_contracts', 'coach_court_rules', 'coach_settings', 'coach_stats_rollup',
  'coach_time_blocks', 'players', 'player_baselines', 'coaching_series', 'sessions',
  'series_players', 'session_players', 'packages', 'invoices', 'credit_transactions',
  'coach_notifications', 'coach_xp_transactions', 'conversations', 'conversation_participants',
  'messages', 'drill_blocks', 'lesson_templates', 'daily_quest_slots', 'diagnostic_reports',
  'invites', 'location_travel_times', 'court_availability', 'court_bookings', 'badges',
  'audit_logs', 'ball_levels'
];

async function getTableCount(dbUrl: string, table: string): Promise<number> {
  try {
    const { stdout } = await execAsync(`psql "${dbUrl}" -t -A -c "SELECT COUNT(*) FROM ${table}"`);
    return parseInt(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

async function syncTable(table: string): Promise<{ table: string; synced: number; error?: string }> {
  const replitUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_DATABASE_URL;

  if (!replitUrl || !supabaseUrl) {
    return { table, synced: 0, error: 'Missing database URLs' };
  }

  try {
    const replitCount = await getTableCount(replitUrl, table);
    const supabaseCount = await getTableCount(supabaseUrl, table);

    if (replitCount === supabaseCount) {
      return { table, synced: 0 };
    }

    const missing = replitCount - supabaseCount;
    if (missing <= 0) {
      return { table, synced: 0 };
    }

    console.log(`[DB-SYNC] ${table}: Syncing ${missing} records...`);

    const exportCmd = `pg_dump "${replitUrl}" --data-only --column-inserts --no-owner --no-acl --table="${table}" 2>/dev/null | grep "^INSERT" > /tmp/sync_${table}.sql`;
    await execAsync(exportCmd);

    const importCmd = `
      (echo "SET session_replication_role = 'replica';"; cat /tmp/sync_${table}.sql; echo "SET session_replication_role = 'origin';") | psql "${supabaseUrl}" 2>&1 | grep -c "INSERT 0 1" || echo "0"
    `;
    const { stdout } = await execAsync(importCmd);
    const synced = parseInt(stdout.trim()) || 0;

    return { table, synced };
  } catch (error) {
    return { table, synced: 0, error: String(error) };
  }
}

export async function runDatabaseSync(verbose = false): Promise<{ total: number; tables: number }> {
  console.log('[DB-SYNC] Starting database synchronization (Replit → Supabase)...');
  
  let totalSynced = 0;
  let tablesWithChanges = 0;

  for (const table of TABLES_TO_SYNC) {
    const result = await syncTable(table);
    
    if (result.error) {
      console.error(`[DB-SYNC] Error syncing ${table}:`, result.error);
    } else if (result.synced > 0) {
      console.log(`[DB-SYNC] ✅ ${table}: ${result.synced} records synced`);
      totalSynced += result.synced;
      tablesWithChanges++;
    } else if (verbose) {
      console.log(`[DB-SYNC] ${table}: already in sync`);
    }
  }

  if (totalSynced > 0) {
    console.log(`[DB-SYNC] Sync complete: ${totalSynced} records synced across ${tablesWithChanges} tables`);
  } else {
    console.log('[DB-SYNC] All tables already in sync');
  }

  return { total: totalSynced, tables: tablesWithChanges };
}

async function verifySync(): Promise<void> {
  const replitUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_DATABASE_URL;

  if (!replitUrl || !supabaseUrl) {
    console.error('[DB-SYNC] Missing database URLs');
    return;
  }

  console.log('\n[DB-SYNC] === VERIFICATION ===');
  
  let synced = 0;
  let outOfSync = 0;

  for (const table of TABLES_TO_SYNC) {
    const replitCount = await getTableCount(replitUrl, table);
    const supabaseCount = await getTableCount(supabaseUrl, table);

    if (replitCount === supabaseCount && replitCount > 0) {
      console.log(`✅ ${table}: ${replitCount}`);
      synced++;
    } else if (replitCount !== supabaseCount) {
      console.log(`❌ ${table}: Replit=${replitCount}, Supabase=${supabaseCount}`);
      outOfSync++;
    }
  }

  console.log(`\nSynced: ${synced}, Out of sync: ${outOfSync}`);
}

const isMainModule = () => {
  try {
    return import.meta.url === `file://${process.argv[1]}` || 
           process.argv[1]?.endsWith('db-sync.ts') ||
           process.argv[1]?.endsWith('db-sync.js');
  } catch {
    return false;
  }
};

if (isMainModule()) {
  const args = process.argv.slice(2);
  const isVerify = args.includes('--verify');
  const isVerbose = args.includes('--verbose');

  if (isVerify) {
    verifySync();
  } else {
    runDatabaseSync(isVerbose);
  }
}
