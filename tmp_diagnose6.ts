import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function diagnose() {
  const players = await db.execute(sql`
    SELECT id FROM players WHERE LOWER(name) LIKE '%asselya%' LIMIT 1
  `);
  const playerId = (players.rows[0] as any).id;
  
  // Get the jan 2026 private_adjusted sessions and their credit transactions
  const janSessions = await db.execute(sql`
    SELECT sp.id as sp_id, sp.session_id, sp.attendance_status, sp.credit_deducted_at, sp.credit_transaction_id,
      s.session_type, s.start_time, cs.session_type as series_type
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    LEFT JOIN coaching_series cs ON cs.id = s.series_id
    WHERE sp.player_id = ${playerId}
      AND s.start_time >= '2026-01-01'
      AND s.status = 'completed'
    ORDER BY s.start_time ASC
  `);
  
  console.log("=== JAN 2026 SESSIONS ===");
  for (const s of janSessions.rows as any[]) {
    console.log(`${s.start_time} | session_type=${s.session_type} | series=${s.series_type} | attendance=${s.attendance_status} | credit_deducted=${!!s.credit_deducted_at} | txn_id=${s.credit_transaction_id}`);
    
    // Get the credit transaction
    if (s.credit_transaction_id) {
      const tx = await db.execute(sql`
        SELECT id, credit_type, amount, reason FROM credit_transactions WHERE id = ${s.credit_transaction_id}
      `);
      console.log(`  => Transaction: ${JSON.stringify(tx.rows[0])}`);
    }
  }
  
  // Check: what credit type were the debts created with for private_adjusted sessions?
  const pvtAdjDebts = await db.execute(sql`
    SELECT ct.id, ct.credit_type, ct.amount, ct.reason, ct.session_id, s.session_type, s.start_time
    FROM credit_transactions ct
    JOIN sessions s ON s.id = ct.session_id
    WHERE ct.player_id = ${playerId}
      AND s.session_type = 'private_adjusted'
      AND ct.type = 'debit'
    ORDER BY ct.created_at ASC
  `);
  
  console.log("\n=== DEBTS FOR PRIVATE_ADJUSTED SESSIONS ===");
  for (const d of pvtAdjDebts.rows as any[]) {
    console.log(`${d.start_time} | credit_type=${d.credit_type} | amount=${d.amount} | reason=${d.reason}`);
  }
  
  process.exit(0);
}

diagnose().catch(e => { console.error(e); process.exit(1); });
