import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fix() {
  const playerId = '4e63ab21-17e1-4892-890a-f4f32b3b636f';
  const packageId = '20c00f20-47fa-490f-99db-9f3aa978c5d0';
  
  // 1. Un-expire the purchase transaction (+20)
  const purchaseResult = await pool.query(
    `UPDATE credit_transactions 
     SET metadata = jsonb_set(
       COALESCE(metadata::jsonb, '{}'::jsonb) - 'expired' - 'expiredReason',
       '{}', '{}'::jsonb
     )
     WHERE player_id = $1 AND package_id = $2 AND amount = 20 AND reason = 'package_purchased'
     RETURNING id, amount, metadata`,
    [playerId, packageId]
  );
  console.log("Un-expired purchase:", purchaseResult.rows);
  
  // Actually let me just remove the expired/expiredReason keys from the metadata
  await pool.query(
    `UPDATE credit_transactions 
     SET metadata = (COALESCE(metadata::jsonb, '{}'::jsonb) - 'expired' - 'expiredReason')
     WHERE player_id = $1 AND package_id = $2 AND amount = 20 AND reason = 'package_purchased'`,
    [playerId, packageId]
  );
  
  // 2. Delete the incorrect -9 debt_settlement 
  // The +20 purchase minus 11 settled debts = 9 remaining
  // The -11 debt_settlement is correct (it settled the 11 debts)
  // But the -9 is incorrect - it was created by the audit and shouldn't exist
  const deleteResult = await pool.query(
    `DELETE FROM credit_transactions 
     WHERE player_id = $1 AND package_id = $2 AND amount = -9 AND reason = 'debt_settlement'
     RETURNING id, amount`,
    [playerId, packageId]
  );
  console.log("Deleted incorrect -9 settlement:", deleteResult.rows);
  
  // 3. Update package: remaining = 9, status = active
  const packageResult = await pool.query(
    `UPDATE packages 
     SET remaining_credits = 9, status = 'active'
     WHERE id = $1
     RETURNING id, remaining_credits, status`,
    [packageId]
  );
  console.log("Updated package:", packageResult.rows);
  
  // 4. Verify final state
  const txs = await pool.query(
    `SELECT amount, credit_type, reason, metadata, package_id 
     FROM credit_transactions 
     WHERE player_id = $1 
     ORDER BY created_at`,
    [playerId]
  );
  
  let activeBalance = 0;
  console.log("\n=== FINAL STATE ===");
  for (const tx of txs.rows) {
    const meta = tx.metadata || {};
    const flags = [meta.settled ? 'SETTLED' : '', meta.expired ? 'EXPIRED' : '', meta.cancelled ? 'CANCELLED' : ''].filter(Boolean).join(',');
    const flag = flags || 'ACTIVE';
    console.log(`  ${tx.amount > 0 ? '+' : ''}${tx.amount} ${tx.credit_type} | ${tx.reason} | ${flag}`);
    if (!meta.settled && !meta.expired && !meta.cancelled) {
      activeBalance += tx.amount;
    }
  }
  console.log(`\nActive balance: ${activeBalance}`);
  console.log("Expected: +20 - 11 = 9 ✓" + (activeBalance === 9 ? " CORRECT" : " WRONG"));
  
  await pool.end();
}

fix().catch(console.error);
