import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function diagnose() {
  const players = await db.execute(sql`
    SELECT id FROM players WHERE LOWER(name) LIKE '%asselya%' LIMIT 1
  `);
  const playerId = (players.rows[0] as any).id;
  
  // Get the 13 feb debt that shouldn't be settled
  const febDebt = await db.execute(sql`
    SELECT id, type, credit_type, amount, reason, metadata, created_at, package_id, session_id
    FROM credit_transactions 
    WHERE player_id = ${playerId}
      AND created_at > '2026-02-13'
      AND created_at < '2026-02-14'
      AND reason = 'session_debt'
  `);
  console.log("=== FEB 13 DEBT DETAIL ===");
  console.log(JSON.stringify(febDebt.rows, null, 2));
  
  // Get the session for that debt to understand what happened
  if (febDebt.rows.length > 0) {
    const sessionId = (febDebt.rows[0] as any).session_id;
    if (sessionId) {
      const session = await db.execute(sql`
        SELECT id, session_type, status, start_time, series_id FROM sessions WHERE id = ${sessionId}
      `);
      console.log("\n=== SESSION FOR THAT DEBT ===");
      console.log(JSON.stringify(session.rows, null, 2));
      
      const sp = await db.execute(sql`
        SELECT id, player_id, attendance_status, credit_deducted_at, credit_transaction_id 
        FROM session_players WHERE session_id = ${sessionId}
      `);
      console.log("\n=== SESSION PLAYERS ===");
      console.log(JSON.stringify(sp.rows, null, 2));
    }
  }

  // Also check: what is the session_player for the REMAINING 1 credit in the package?
  // The package has remaining=1 but 10 debts were settled. So 9 credits were used for debts and 1 was consumed for a session?
  const pkgId = '9629ea21-2c9e-453a-88d3-6f7bc3717113';
  const pkgTxns = await db.execute(sql`
    SELECT id, type, amount, reason, session_id, session_player_id, metadata, created_at
    FROM credit_transactions 
    WHERE package_id = ${pkgId}
    ORDER BY created_at ASC
  `);
  console.log("\n=== ALL TRANSACTIONS FOR SEMI-PRIVATE PACKAGE ===");
  console.log(JSON.stringify(pkgTxns.rows, null, 2));
  
  process.exit(0);
}

diagnose().catch(e => { console.error(e); process.exit(1); });
