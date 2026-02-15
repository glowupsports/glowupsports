import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function diagnose() {
  const players = await db.execute(sql`
    SELECT id, name FROM players WHERE LOWER(name) LIKE '%asselya%' LIMIT 1
  `);
  const playerId = (players.rows[0] as any).id;
  
  // Get ALL credit transactions for semi_private
  const txns = await db.execute(sql`
    SELECT type, credit_type, amount, reason, created_at, package_id, session_id
    FROM credit_transactions 
    WHERE player_id = ${playerId}
    ORDER BY created_at ASC
  `);
  
  console.log("=== ALL CREDIT TRANSACTIONS ===");
  let balance: any = { semi_private: 0, private: 0, group: 0 };
  for (const t of txns.rows as any[]) {
    const ct = t.credit_type || 'unknown';
    balance[ct] = (balance[ct] || 0) + t.amount;
    console.log(`${t.created_at} | ${t.type} | ${ct} | amount=${t.amount} | reason=${t.reason} | running_${ct}=${balance[ct]}`);
  }
  console.log("\n=== FINAL BALANCE ===");
  console.log(JSON.stringify(balance));
  
  // Get ALL packages
  const packages = await db.execute(sql`
    SELECT id, credit_type, total_credits, remaining_credits, status, created_at, expiry_date
    FROM packages WHERE player_id = ${playerId}
    ORDER BY created_at ASC
  `);
  console.log("\n=== ALL PACKAGES ===");
  for (const p of packages.rows as any[]) {
    console.log(`${p.created_at} | ${p.credit_type} | total=${p.total_credits} | remaining=${p.remaining_credits} | status=${p.status} | expires=${p.expiry_date}`);
  }
  
  // Count how many sessions had credit_deducted for semi-private
  const deducted = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    LEFT JOIN coaching_series cs ON cs.id = s.series_id
    WHERE sp.player_id = ${playerId}
      AND s.status = 'completed'
      AND sp.credit_deducted_at IS NOT NULL
      AND (cs.session_type = 'semi_private' OR s.session_type = 'semi_private')
  `);
  console.log("\n=== SEMI-PRIVATE SESSIONS WITH CREDIT DEDUCTED ===");
  console.log("Count:", (deducted.rows[0] as any).count);
  
  // What credit type was used for semi-private sessions?
  const deductedTypes = await db.execute(sql`
    SELECT ct.credit_type, COUNT(*) as count
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    LEFT JOIN coaching_series cs ON cs.id = s.series_id
    LEFT JOIN credit_transactions ct ON ct.session_player_id = sp.id AND ct.type = 'debit'
    WHERE sp.player_id = ${playerId}
      AND s.status = 'completed'
      AND sp.credit_deducted_at IS NOT NULL
      AND (cs.session_type = 'semi_private' OR s.session_type = 'semi_private')
    GROUP BY ct.credit_type
  `);
  console.log("\n=== CREDIT TYPES USED FOR SEMI-PRIVATE SESSIONS ===");
  console.log(JSON.stringify(deductedTypes.rows, null, 2));
  
  process.exit(0);
}

diagnose().catch(e => { console.error(e); process.exit(1); });
