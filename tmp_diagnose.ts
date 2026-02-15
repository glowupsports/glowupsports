import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function diagnose() {
  const players = await db.execute(sql`
    SELECT id, name FROM players WHERE LOWER(name) LIKE '%asselya%' LIMIT 5
  `);
  console.log("=== PLAYER SEARCH ===");
  console.log(JSON.stringify(players.rows, null, 2));
  
  if (players.rows.length === 0) {
    console.log("Player not found");
    process.exit(0);
  }
  
  const playerId = (players.rows[0] as any).id;
  console.log("\nPlayer ID:", playerId);
  
  const sessions = await db.execute(sql`
    SELECT 
      sp.id as sp_id,
      sp.attendance_status,
      sp.credit_deducted_at,
      sp.credit_transaction_id,
      s.session_type,
      s.status,
      s.start_time,
      s.series_id,
      cs.session_type as series_type,
      cs.title as series_title
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    LEFT JOIN coaching_series cs ON cs.id = s.series_id
    WHERE sp.player_id = ${playerId}
      AND s.status = 'completed'
    ORDER BY s.start_time ASC
  `);
  
  const rows = sessions.rows as any[];
  console.log("\n=== ALL COMPLETED SESSIONS ===");
  console.log("Total:", rows.length);
  
  const semiPrivate = rows.filter((r: any) => r.series_type === 'semi_private' || r.session_type === 'semi_private');
  const privateAdj = rows.filter((r: any) => r.session_type === 'private_adjusted');
  const privateOnly = rows.filter((r: any) => r.session_type === 'private' && r.series_type !== 'semi_private');
  const group = rows.filter((r: any) => r.session_type === 'group');
  
  console.log("\n=== BY TYPE ===");
  console.log("Semi-private sessions (session_type=semi_private OR series_type=semi_private):", semiPrivate.length);
  console.log("  of which private_adjusted:", privateAdj.length);
  console.log("Pure private:", privateOnly.length);
  console.log("Group:", group.length);
  
  console.log("\n=== SEMI-PRIVATE DETAIL ===");
  let creditDeducted = 0;
  let creditMissing = 0;
  for (const s of semiPrivate) {
    const hasCredit = !!(s as any).credit_deducted_at;
    if (hasCredit) creditDeducted++;
    else creditMissing++;
    console.log(`  ${(s as any).start_time} | sess_type=${(s as any).session_type} | series=${(s as any).series_type} | attendance=${(s as any).attendance_status} | credit=${hasCredit ? 'YES' : 'MISSING'}`);
  }
  console.log(`\nCredit deducted: ${creditDeducted}, Missing: ${creditMissing}`);
  
  const packages = await db.execute(sql`
    SELECT id, credit_type, total_credits, remaining_credits, status, expiry_date
    FROM packages WHERE player_id = ${playerId}
    ORDER BY created_at DESC
  `);
  console.log("\n=== PACKAGES ===");
  console.log(JSON.stringify(packages.rows, null, 2));
  
  const txns = await db.execute(sql`
    SELECT type, credit_type, amount, reason, created_at
    FROM credit_transactions WHERE player_id = ${playerId}
    ORDER BY created_at DESC
    LIMIT 30
  `);
  console.log("\n=== RECENT CREDIT TRANSACTIONS ===");
  console.log(JSON.stringify(txns.rows, null, 2));
  
  process.exit(0);
}

diagnose().catch(e => { console.error(e); process.exit(1); });
