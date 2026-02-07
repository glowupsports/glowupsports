import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function debug() {
  // ALMA
  const alma = await pool.query(`SELECT id, name FROM players WHERE name ILIKE '%Alma%Zalesski%'`);
  console.log("=== ALMA ZALESSKI ===");
  if (alma.rows.length > 0) {
    const id = alma.rows[0].id;
    console.log("ID:", id);
    
    const pkgs = await pool.query(`SELECT id, credit_type, total_credits, remaining_credits, status, expiry_date FROM packages WHERE player_id = $1`, [id]);
    console.log("\nPackages:", JSON.stringify(pkgs.rows, null, 2));
    
    const txs = await pool.query(`SELECT id, amount, credit_type, type, reason, package_id, metadata, created_at FROM credit_transactions WHERE player_id = $1 ORDER BY created_at`, [id]);
    console.log("\nTransactions (" + txs.rows.length + "):");
    for (const tx of txs.rows) {
      const meta = tx.metadata || {};
      const flags = [meta.settled ? 'SETTLED' : '', meta.expired ? 'EXPIRED' : '', meta.cancelled ? 'CANCELLED' : ''].filter(Boolean).join(',');
      console.log(`  ${tx.amount > 0 ? '+' : ''}${tx.amount} ${tx.credit_type} | ${tx.reason} | pkg:${tx.package_id?.substring(0,8) || 'none'} | ${flags || 'ACTIVE'} | ${new Date(tx.created_at).toISOString().substring(0,16)}`);
    }
    
    let activeBalance = 0;
    for (const tx of txs.rows) {
      const meta = tx.metadata || {};
      if (meta.settled || meta.expired || meta.cancelled) continue;
      activeBalance += tx.amount;
    }
    console.log("\nActive balance:", activeBalance);
  }

  // AMELIA
  const amelia = await pool.query(`SELECT id, name FROM players WHERE name ILIKE '%Amelia%Holdich%'`);
  console.log("\n\n=== AMELIA AVA HOLDICH ===");
  if (amelia.rows.length > 0) {
    const id = amelia.rows[0].id;
    console.log("ID:", id);
    
    const pkgs = await pool.query(`SELECT id, credit_type, total_credits, remaining_credits, status, expiry_date FROM packages WHERE player_id = $1`, [id]);
    console.log("\nPackages:", JSON.stringify(pkgs.rows, null, 2));
    
    const txs = await pool.query(`SELECT id, amount, credit_type, type, reason, package_id, metadata, created_at FROM credit_transactions WHERE player_id = $1 ORDER BY created_at`, [id]);
    console.log("\nTransactions (" + txs.rows.length + "):");
    for (const tx of txs.rows) {
      const meta = tx.metadata || {};
      const flags = [meta.settled ? 'SETTLED' : '', meta.expired ? 'EXPIRED' : '', meta.cancelled ? 'CANCELLED' : ''].filter(Boolean).join(',');
      console.log(`  ${tx.amount > 0 ? '+' : ''}${tx.amount} ${tx.credit_type} | ${tx.reason} | pkg:${tx.package_id?.substring(0,8) || 'none'} | ${flags || 'ACTIVE'} | ${new Date(tx.created_at).toISOString().substring(0,16)}`);
    }
    
    let activeBalance = 0;
    for (const tx of txs.rows) {
      const meta = tx.metadata || {};
      if (meta.settled || meta.expired || meta.cancelled) continue;
      activeBalance += tx.amount;
    }
    console.log("\nActive balance:", activeBalance);
  }
  
  await pool.end();
}

debug().catch(console.error);
