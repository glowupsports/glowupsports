import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function diagnose() {
  const players = await db.execute(sql`
    SELECT id FROM players WHERE LOWER(name) LIKE '%asselya%' LIMIT 1
  `);
  const playerId = (players.rows[0] as any).id;
  
  // Get ALL transactions with full detail
  const txns = await db.execute(sql`
    SELECT id, type, credit_type, amount, reason, package_id, metadata, created_at
    FROM credit_transactions 
    WHERE player_id = ${playerId}
    ORDER BY created_at ASC
  `);
  
  // Get all packages
  const pkgs = await db.execute(sql`
    SELECT id, credit_type, total_credits, remaining_credits, status
    FROM packages WHERE player_id = ${playerId}
  `);
  const pkgIds = new Set((pkgs.rows as any[]).map(p => p.id));
  
  console.log("=== PACKAGES ===");
  for (const p of pkgs.rows as any[]) {
    console.log(`  ${p.id} | ${p.credit_type} | total=${p.total_credits} | remaining=${p.remaining_credits} | status=${p.status}`);
  }
  
  console.log("\n=== TRANSACTION ANALYSIS ===");
  let balance = { semi_private: 0, private: 0, group: 0 };
  let skippedCount = 0;
  
  for (const tx of txns.rows as any[]) {
    const meta = tx.metadata as any;
    let skip = false;
    let skipReason = "";
    
    // Reproduce the exact logic from getPlayerCreditBalanceByType
    if (meta?.settled === true || meta?.cancelled === true || meta?.expired === true) {
      skip = true; skipReason = "meta flag (settled/cancelled/expired)";
    }
    if (!skip && tx.amount > 0 && tx.package_id && !pkgIds.has(tx.package_id)) {
      skip = true; skipReason = "purchase from deleted package";
    }
    if (!skip && tx.amount > 0 && !tx.package_id && ["package_purchased", "package_purchase", "package_deleted_refund"].includes(tx.reason)) {
      skip = true; skipReason = "orphan purchase/refund";
    }
    if (!skip && tx.reason === "debt_settlement" && (!tx.package_id || !pkgIds.has(tx.package_id))) {
      skip = true; skipReason = "orphan debt_settlement";
    }
    if (!skip && !tx.credit_type) {
      skip = true; skipReason = "null credit_type";
    }
    
    if (!skip) {
      const ct = tx.credit_type as keyof typeof balance;
      if (balance[ct] !== undefined) balance[ct] += tx.amount;
    } else {
      skippedCount++;
    }
    
    console.log(`${skip ? 'SKIP' : 'COUNT'} | ${tx.created_at} | ${tx.type} | ${tx.credit_type} | amount=${tx.amount} | reason=${tx.reason} | pkg=${tx.package_id ? 'yes' : 'NO'} | pkg_exists=${tx.package_id ? pkgIds.has(tx.package_id) : 'n/a'}${skip ? ' | REASON: ' + skipReason : ''}`);
  }
  
  console.log(`\n=== COMPUTED BALANCE (same logic as UI) ===`);
  console.log(JSON.stringify(balance));
  console.log(`Skipped: ${skippedCount} transactions`);
  
  process.exit(0);
}

diagnose().catch(e => { console.error(e); process.exit(1); });
