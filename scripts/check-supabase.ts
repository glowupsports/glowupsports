import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({ 
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const tables = ['academies', 'coaches', 'players', 'users', 'sessions', 'session_players', 'courts'];
  console.log("Data in Supabase:");
  for (const table of tables) {
    try {
      const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
      console.log(`  ${table}: ${result.rows[0].count} rows`);
    } catch (e) {
      console.log(`  ${table}: error`);
    }
  }
  await pool.end();
}
check();
