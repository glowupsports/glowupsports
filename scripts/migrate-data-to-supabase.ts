import pkg from "pg";
const { Pool } = pkg;

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.SUPABASE_DATABASE_URL;

if (!sourceUrl) throw new Error("DATABASE_URL (Replit) must be set");
if (!targetUrl) throw new Error("SUPABASE_DATABASE_URL must be set");

console.log("Setting up connections...");

const sourcePool = new Pool({ connectionString: sourceUrl });
const targetPool = new Pool({ 
  connectionString: targetUrl,
  ssl: { rejectUnauthorized: false }
});

// Tables in proper dependency order (parent tables first)
const tablesToMigrate = [
  'academies',
  'coaches',
  'players', 
  'users',
  'locations',
  'courts',
  'sessions',
  'session_players',
  'session_feedback',
  'session_skill_observations',
  'player_notes',
  'player_holidays',
  'messages',
  'conversations',
  'conversation_participants',
  'notifications',
  'invoices',
  'xp_transactions',
  'coach_xp_transactions',
  'coach_earnings',
  'recurring_series',
  'session_templates',
  'drill_blocks',
];

async function getTableColumns(pool: any, tableName: string): Promise<string[]> {
  const result = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  return result.rows.map((r: any) => r.column_name);
}

async function migrateTable(tableName: string) {
  console.log(`\nMigrating ${tableName}...`);
  
  try {
    // Get columns from source
    const sourceColumns = await getTableColumns(sourcePool, tableName);
    if (sourceColumns.length === 0) {
      console.log(`  [SKIP] Table doesn't exist in source`);
      return { table: tableName, copied: 0, status: 'skipped' };
    }
    
    // Get columns from target
    const targetColumns = await getTableColumns(targetPool, tableName);
    if (targetColumns.length === 0) {
      console.log(`  [SKIP] Table doesn't exist in target`);
      return { table: tableName, copied: 0, status: 'skipped' };
    }
    
    // Find common columns
    const commonColumns = sourceColumns.filter(c => targetColumns.includes(c));
    if (commonColumns.length === 0) {
      console.log(`  [SKIP] No common columns`);
      return { table: tableName, copied: 0, status: 'skipped' };
    }
    
    // Get source row count
    const countResult = await sourcePool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
    const totalRows = parseInt(countResult.rows[0].count);
    
    if (totalRows === 0) {
      console.log(`  [SKIP] Empty table`);
      return { table: tableName, copied: 0, status: 'empty' };
    }
    
    console.log(`  Found ${totalRows} rows, ${commonColumns.length} common columns`);
    
    // Fetch all data using only common columns
    const columnList = commonColumns.map(c => `"${c}"`).join(', ');
    const sourceData = await sourcePool.query(`SELECT ${columnList} FROM "${tableName}"`);
    
    // Clear target table first (to avoid conflicts)
    await targetPool.query(`DELETE FROM "${tableName}" WHERE true`);
    
    // Insert data in batches
    let inserted = 0;
    const batchSize = 100;
    
    for (let i = 0; i < sourceData.rows.length; i += batchSize) {
      const batch = sourceData.rows.slice(i, i + batchSize);
      
      for (const row of batch) {
        const values = commonColumns.map(c => row[c]);
        const placeholders = commonColumns.map((_, idx) => `$${idx + 1}`).join(', ');
        
        try {
          await targetPool.query(`
            INSERT INTO "${tableName}" (${columnList})
            VALUES (${placeholders})
            ON CONFLICT DO NOTHING
          `, values);
          inserted++;
        } catch (err: any) {
          // Skip individual errors, continue with next row
          if (!err.message.includes('duplicate') && !err.message.includes('violates')) {
            console.log(`    [WARN] Row error: ${err.message.substring(0, 80)}`);
          }
        }
      }
    }
    
    console.log(`  [OK] Copied ${inserted}/${totalRows} rows`);
    return { table: tableName, copied: inserted, total: totalRows, status: 'ok' };
    
  } catch (err: any) {
    console.log(`  [ERROR] ${err.message.substring(0, 100)}`);
    return { table: tableName, copied: 0, status: 'error', error: err.message };
  }
}

async function disableConstraints() {
  console.log("Temporarily disabling foreign key checks...");
  await targetPool.query("SET session_replication_role = replica;");
}

async function enableConstraints() {
  console.log("Re-enabling foreign key checks...");
  await targetPool.query("SET session_replication_role = DEFAULT;");
}

async function migrate() {
  console.log("=== Starting Data Migration: Replit → Supabase ===\n");
  
  await disableConstraints();
  
  const results = [];
  for (const table of tablesToMigrate) {
    const result = await migrateTable(table);
    results.push(result);
  }
  
  await enableConstraints();
  
  console.log("\n=== Migration Summary ===");
  const ok = results.filter(r => r.status === 'ok');
  const skipped = results.filter(r => r.status === 'skipped' || r.status === 'empty');
  const errors = results.filter(r => r.status === 'error');
  
  console.log(`Successful: ${ok.length} tables`);
  console.log(`Skipped: ${skipped.length} tables`);
  console.log(`Errors: ${errors.length} tables`);
  
  if (ok.length > 0) {
    console.log("\nData copied:");
    ok.forEach(r => console.log(`  - ${r.table}: ${r.copied}/${r.total} rows`));
  }
  
  await sourcePool.end();
  await targetPool.end();
  
  console.log("\n=== Migration Complete ===");
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
