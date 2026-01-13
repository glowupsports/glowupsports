import pkg from "pg";
const { Pool } = pkg;

const sourcePool = new Pool({ connectionString: process.env.DATABASE_URL });
const targetPool = new Pool({ 
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Remaining tables to migrate
const tables = ['session_players', 'session_feedback'];

async function getTableColumns(pool: any, tableName: string): Promise<string[]> {
  const result = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = $1
  `, [tableName]);
  return result.rows.map((r: any) => r.column_name);
}

async function migrateTable(tableName: string) {
  console.log(`Migrating ${tableName}...`);
  
  const sourceColumns = await getTableColumns(sourcePool, tableName);
  const targetColumns = await getTableColumns(targetPool, tableName);
  const commonColumns = sourceColumns.filter(c => targetColumns.includes(c));
  
  const columnList = commonColumns.map(c => `"${c}"`).join(', ');
  const sourceData = await sourcePool.query(`SELECT ${columnList} FROM "${tableName}"`);
  
  console.log(`  Source has ${sourceData.rows.length} rows`);
  
  // Get existing count
  const existingCount = await targetPool.query(`SELECT COUNT(*) FROM "${tableName}"`);
  console.log(`  Target has ${existingCount.rows[0].count} rows`);
  
  // Disable FK checks
  await targetPool.query("SET session_replication_role = replica;");
  
  let inserted = 0;
  for (const row of sourceData.rows) {
    const values = commonColumns.map(c => row[c]);
    const placeholders = commonColumns.map((_, i) => `$${i + 1}`).join(', ');
    try {
      await targetPool.query(`INSERT INTO "${tableName}" (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values);
      inserted++;
    } catch (e) {}
  }
  
  await targetPool.query("SET session_replication_role = DEFAULT;");
  console.log(`  Inserted ${inserted} new rows`);
}

async function run() {
  for (const table of tables) {
    await migrateTable(table);
  }
  await sourcePool.end();
  await targetPool.end();
}

run();
