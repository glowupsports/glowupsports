import { defineConfig } from "drizzle-kit";

const dbUrl = process.env.SUPABASE_DATABASE_URL;

if (!dbUrl) {
  throw new Error("SUPABASE_DATABASE_URL is not set");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
