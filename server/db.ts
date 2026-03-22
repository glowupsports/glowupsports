import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

// Always use Supabase database for both development and production
const databaseUrl = process.env.SUPABASE_DATABASE_URL || "";

if (!databaseUrl) {
  console.error("[Database] CRITICAL: SUPABASE_DATABASE_URL is not set!");
  console.error("[Database] Available env vars:", Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('SUPA') || k.includes('PG')));
  throw new Error("SUPABASE_DATABASE_URL must be set");
}

// Log connection attempt (mask sensitive parts)
const maskedUrl = databaseUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
console.log(`[Database] Attempting connection to: ${maskedUrl.substring(0, 50)}...`);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  // Optimized for Supabase Transaction Pooler (port 6543)
  max: 12,                        // Good balance for concurrent requests
  min: 2,                         // Keep connections warm
  connectionTimeoutMillis: 10000, // 10s timeout
  idleTimeoutMillis: 30000,       // Release idle after 30s
  keepAlive: true,                // Keep connections alive
  allowExitOnIdle: false,         // Keep pool alive for server
});

console.log('[Database] Pool configured: max=12, min=2, keepAlive=true');

// Add error handler to pool
pool.on('error', (err) => {
  console.error('[Database] Pool error:', err.message);
});

// Test connection on startup
pool.query('SELECT 1').then(async () => {
  console.log('[Database] Connection test successful - Supabase PostgreSQL ready');
  try {
    await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS audit_verified_at TIMESTAMP`);
    await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS audit_verified_by VARCHAR`);
  } catch (e: any) {
    console.log('[Database] Audit columns already exist or migration skipped');
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_availability (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id VARCHAR NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS provider_availability_provider_idx ON provider_availability(provider_id)`);
  } catch (e: any) {
    console.log('[Database] provider_availability migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_order_upsells (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id VARCHAR NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
        provider_id VARCHAR NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
        service_id VARCHAR,
        label TEXT NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        responded_at TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS shop_order_upsells_order_idx ON shop_order_upsells(order_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS shop_order_upsells_provider_idx ON shop_order_upsells(provider_id)`);
  } catch (e: any) {
    console.log('[Database] shop_order_upsells migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS beta_feedback (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id VARCHAR REFERENCES players(id),
        player_name TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS bf_player_idx ON beta_feedback(player_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS bf_created_idx ON beta_feedback(created_at)`);
  } catch (e: any) {
    console.log('[Database] beta_feedback migration skipped:', e.message);
  }
}).catch((err) => {
  console.error('[Database] Connection test FAILED:', err.message);
});

export const db = drizzle(pool, { schema });
export { pool };

console.log(`[Database] Drizzle ORM initialized with Supabase PostgreSQL`);
