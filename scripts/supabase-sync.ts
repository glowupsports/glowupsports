import pkg from "pg";
const { Pool } = pkg;
import * as fs from "fs";

// Get Supabase URL
const supabaseUrl = process.env.SUPABASE_DATABASE_URL;
if (!supabaseUrl) {
  console.error("SUPABASE_DATABASE_URL is not set");
  process.exit(1);
}

console.log("Connecting to Supabase...");

const pool = new Pool({
  connectionString: supabaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("Connected to Supabase successfully!");
    
    // Check what tables exist
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log("\nExisting tables in Supabase:");
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
    client.release();
    await pool.end();
  } catch (err: any) {
    console.error("Connection failed:", err.message);
    process.exit(1);
  }
}

testConnection();
