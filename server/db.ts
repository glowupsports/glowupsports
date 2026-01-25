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
  // Optimized for Supabase Transaction Pooler (port 6543) - respect server limits
  max: 8,                         // Stay under Supabase pooler limit
  min: 2,                         // Keep connections warm
  connectionTimeoutMillis: 30000, // Allow time for queue + high latency
  idleTimeoutMillis: 60000,       // Keep connections alive longer
  allowExitOnIdle: false,         // Keep pool alive for server
});

console.log('[Database] Pool configured: max=8, min=2, Supabase limit optimized');

// Add error handler to pool
pool.on('error', (err) => {
  console.error('[Database] Pool error:', err.message);
});

// Test connection on startup
pool.query('SELECT 1').then(() => {
  console.log('[Database] Connection test successful - Supabase PostgreSQL ready');
}).catch((err) => {
  console.error('[Database] Connection test FAILED:', err.message);
});

export const db = drizzle(pool, { schema });

console.log(`[Database] Drizzle ORM initialized with Supabase PostgreSQL`);
