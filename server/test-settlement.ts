import { storage } from "./storage";
import { db } from "./db";
import { creditTransactions } from "../shared/schema";
import { eq, and, or, isNull } from "drizzle-orm";

async function testSettlement() {
  console.log("[Test Settlement] Starting...\n");
  
  // Query for players with unsettled debts directly
  const unsettledDebts = await db.select({
    playerId: creditTransactions.playerId,
    reason: creditTransactions.reason,
    creditType: creditTransactions.creditType,
    amount: creditTransactions.amount,
    metadata: creditTransactions.metadata,
  }).from(creditTransactions)
    .where(and(
      or(
        eq(creditTransactions.reason, "session_debt"),
        eq(creditTransactions.reason, "session_join_debt"),
        eq(creditTransactions.reason, "session_unpaid")
      ),
      isNull(creditTransactions.packageId)
    ));
  
  // Filter to only truly unsettled (metadata.settled != true)
  const trulyUnsettled = unsettledDebts.filter(d => {
    const meta = d.metadata as Record<string, unknown> | null;
    return !meta?.settled;
  });
  
  console.log(`Found ${trulyUnsettled.length} unsettled debts total:\n`);
  
  // Group by player
  const byPlayer: Record<string, { count: number; reasons: Set<string> }> = {};
  for (const debt of trulyUnsettled) {
    if (!byPlayer[debt.playerId]) {
      byPlayer[debt.playerId] = { count: 0, reasons: new Set() };
    }
    byPlayer[debt.playerId].count++;
    byPlayer[debt.playerId].reasons.add(debt.reason);
  }
  
  const playerIds = Object.keys(byPlayer);
  console.log(`Players with open debts: ${playerIds.length}\n`);
  
  for (const playerId of playerIds.slice(0, 5)) {
    const info = byPlayer[playerId];
    console.log(`- Player ${playerId.slice(0, 8)}...`);
    console.log(`  Debts: ${info.count}, Reasons: ${Array.from(info.reasons).join(", ")}`);
  }
  
  // Test with specific player if provided
  const testPlayerId = process.argv[2];
  if (testPlayerId) {
    console.log(`\n=== Testing with player ${testPlayerId} ===\n`);
    
    const balance = await storage.getPlayerCreditBalance(testPlayerId);
    console.log("Balance:", JSON.stringify(balance, null, 2));
  }
  
  console.log("\n=== TEST COMPLETE ===");
  process.exit(0);
}

testSettlement().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
