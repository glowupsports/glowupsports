import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function diagnose() {
  const players = await db.execute(sql`
    SELECT id FROM players WHERE LOWER(name) LIKE '%asselya%' LIMIT 1
  `);
  const playerId = (players.rows[0] as any).id;
  
  // Count actual UNIQUE sessions where she was present in semi-private
  const uniqueSessions = await db.execute(sql`
    SELECT DISTINCT sp.session_id, sp.attendance_status, s.session_type, s.start_time, 
      cs.session_type as series_type, cs.title as series_title,
      sp.credit_deducted_at
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    LEFT JOIN coaching_series cs ON cs.id = s.series_id
    WHERE sp.player_id = ${playerId}
      AND s.status = 'completed'
      AND (s.session_type IN ('semi_private', 'private_adjusted') OR cs.session_type = 'semi_private')
    ORDER BY s.start_time ASC
  `);
  
  console.log("=== ALL SEMI-PRIVATE SESSIONS (unique, completed) ===");
  let present = 0, absent = 0, other = 0;
  for (const s of uniqueSessions.rows as any[]) {
    const att = s.attendance_status || 'unknown';
    if (att === 'present' || att === 'late') present++;
    else if (att === 'absent') absent++;
    else other++;
    console.log(`${s.start_time} | session_type=${s.session_type} | series=${s.series_type} | attendance=${att} | credit_deducted=${!!s.credit_deducted_at}`);
  }
  console.log(`\nTotal: ${uniqueSessions.rows.length} | Present/Late: ${present} | Absent: ${absent} | Other: ${other}`);
  
  // Now count the DEBT transactions (not including purchase/settlement)
  const debts = await db.execute(sql`
    SELECT id, amount, reason, metadata, created_at
    FROM credit_transactions 
    WHERE player_id = ${playerId}
      AND credit_type = 'semi_private'
      AND type = 'debit'
      AND reason != 'debt_settlement'
    ORDER BY created_at ASC
  `);
  
  console.log(`\n=== SEMI-PRIVATE DEBIT TRANSACTIONS ===`);
  let settled = 0, cancelled = 0, active = 0;
  for (const d of debts.rows as any[]) {
    const meta = d.metadata as any;
    const status = meta?.settled ? 'SETTLED' : meta?.cancelled ? 'CANCELLED' : 'ACTIVE';
    if (status === 'SETTLED') settled++;
    else if (status === 'CANCELLED') cancelled++;
    else active++;
    console.log(`${d.created_at} | amount=${d.amount} | reason=${d.reason} | status=${status}`);
  }
  console.log(`\nTotal debits: ${debts.rows.length} | Settled: ${settled} | Cancelled: ${cancelled} | Active (counting): ${active}`);
  console.log(`\nExpected balance: +10 (package) - ${active} (active debts) = ${10 - active}`);
  
  process.exit(0);
}

diagnose().catch(e => { console.error(e); process.exit(1); });
