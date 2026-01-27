import { db } from "./db";
import { sql } from "drizzle-orm";

async function migrate() {
  try {
    console.log("[Migration] Adding new columns to credit_transactions...");
    
    // Add session_player_id column if not exists
    await db.execute(sql`
      ALTER TABLE credit_transactions 
      ADD COLUMN IF NOT EXISTS session_player_id VARCHAR REFERENCES session_players(id)
    `);
    console.log("[Migration] Added session_player_id column");
    
    // Add event_key column if not exists
    await db.execute(sql`
      ALTER TABLE credit_transactions 
      ADD COLUMN IF NOT EXISTS event_key VARCHAR
    `);
    console.log("[Migration] Added event_key column");
    
    // Create unique index on event_key (partial - only where not null)
    try {
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_event_key_unique 
        ON credit_transactions(event_key) 
        WHERE event_key IS NOT NULL
      `);
      console.log("[Migration] Created unique index on event_key");
    } catch (indexErr: any) {
      if (indexErr.code === '42P07') {
        console.log("[Migration] Index already exists - skipping");
      } else {
        throw indexErr;
      }
    }
    
    console.log("[Migration] Schema migration complete!");
  } catch (err) {
    console.error("[Migration] Error:", err);
    process.exit(1);
  }
  process.exit(0);
}

migrate();
