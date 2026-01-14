import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

// Environment-based database selection:
// - Development: Use Replit's built-in DATABASE_URL
// - Production: Use SUPABASE_DATABASE_URL
const isProduction = process.env.NODE_ENV === "production";

let databaseUrl: string;
let useSSL = false;

if (isProduction) {
  // Production uses Supabase
  databaseUrl = process.env.SUPABASE_DATABASE_URL || "";
  useSSL = true;
  if (!databaseUrl) {
    throw new Error("SUPABASE_DATABASE_URL must be set for production");
  }
} else {
  // Development uses Replit's built-in database
  databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set for development");
  }
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });

// Log which database is being used
const dbType = isProduction ? "Supabase (Production)" : "Replit (Development)";
console.log(`[Database] Connected to ${dbType} PostgreSQL`);
