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
  try {
    await pool.query(`ALTER TABLE session_skill_feedback ADD COLUMN IF NOT EXISTS stroke_feedback JSONB`);
    await pool.query(`ALTER TABLE session_skill_feedback ADD COLUMN IF NOT EXISTS lesson_intensity TEXT`);
    await pool.query(`ALTER TABLE session_skill_feedback ADD COLUMN IF NOT EXISTS player_note TEXT`);
  } catch (e: any) {
    console.log('[Database] stroke_feedback columns migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS video_feedback (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        coach_id VARCHAR NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
        player_id VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        session_id VARCHAR REFERENCES sessions(id) ON DELETE SET NULL,
        academy_id VARCHAR REFERENCES academies(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        video_url TEXT NOT NULL,
        thumbnail_url TEXT,
        annotations JSONB DEFAULT '[]'::jsonb,
        message_id VARCHAR,
        conversation_id VARCHAR,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS vf_coach_idx ON video_feedback(coach_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS vf_player_idx ON video_feedback(player_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS vf_academy_idx ON video_feedback(academy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS vf_created_idx ON video_feedback(created_at)`);
  } catch (e: any) {
    console.log('[Database] video_feedback migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS equipment (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        academy_id VARCHAR NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'rental',
        price_credits INTEGER,
        price_cash NUMERIC(10,2),
        currency TEXT DEFAULT 'AED',
        quantity INTEGER NOT NULL DEFAULT 1,
        available_quantity INTEGER NOT NULL DEFAULT 1,
        photo_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS equipment_academy_idx ON equipment(academy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS equipment_type_idx ON equipment(type)`);
  } catch (e: any) {
    console.log('[Database] equipment migration skipped:', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS equipment_rentals (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        equipment_id VARCHAR NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
        player_id VARCHAR NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        academy_id VARCHAR NOT NULL REFERENCES academies(id) ON DELETE CASCADE,
        reserved_from TIMESTAMP NOT NULL,
        reserved_until TIMESTAMP NOT NULL,
        returned_at TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'reserved',
        payment_method TEXT NOT NULL DEFAULT 'credits',
        amount_paid NUMERIC(10,2),
        credits_used INTEGER,
        notes TEXT,
        checked_out_by VARCHAR,
        checked_in_by VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE equipment_rentals ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'rental'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS eq_rentals_equipment_idx ON equipment_rentals(equipment_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS eq_rentals_player_idx ON equipment_rentals(player_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS eq_rentals_academy_idx ON equipment_rentals(academy_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS eq_rentals_status_idx ON equipment_rentals(status)`);
  } catch (e: any) {
    console.log('[Database] equipment_rentals migration skipped:', e.message);
  }
}).catch((err) => {
  console.error('[Database] Connection test FAILED:', err.message);
});

export const db = drizzle(pool, { schema });
export { pool };

console.log(`[Database] Drizzle ORM initialized with Supabase PostgreSQL`);
