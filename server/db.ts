import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

// Use Supabase as primary database (with automatic sync)
// Falls back to Replit DATABASE_URL if Supabase is not configured
const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("SUPABASE_DATABASE_URL or DATABASE_URL must be set");
}

// Configure SSL for Supabase connections
const isSupabase = !!process.env.SUPABASE_DATABASE_URL;

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });

// Log which database is being used
console.log(`[Database] Connected to ${isSupabase ? 'Supabase' : 'Replit'} PostgreSQL`);
