import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

// Use Replit database for development, Supabase for production
const isProduction = process.env.NODE_ENV === "production";
const databaseUrl = isProduction 
  ? (process.env.SUPABASE_DATABASE_URL || "") 
  : (process.env.DATABASE_URL || "");
const useSSL = isProduction;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or SUPABASE_DATABASE_URL must be set");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });

const dbType = isProduction ? "Supabase (Production)" : "Replit (Development)";
console.log(`[Database] Connected to ${dbType} PostgreSQL`);
