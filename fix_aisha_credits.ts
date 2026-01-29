import { db } from './server/db';
import { creditTransactions } from './shared/schema';
import { eq } from 'drizzle-orm';

async function fixAishaCredits() {
  // The incorrect transaction ID for +20 private
  const incorrectTransactionId = 'cfbb198c-89e4-471c-b42b-2da2e71ba267';
  
  console.log("Deleting incorrect +20 private credit transaction for Aisha...");
  
  // First verify it exists
  const tx = await db.select().from(creditTransactions).where(eq(creditTransactions.id, incorrectTransactionId)).limit(1);
  
  if (tx.length === 0) {
    console.log("Transaction not found!");
    return;
  }
  
  console.log("Found transaction:", tx[0]);
  
  // Delete it
  await db.delete(creditTransactions).where(eq(creditTransactions.id, incorrectTransactionId));
  
  console.log("Deleted successfully!");
  
  // Verify new balance
  const playerId = 'd176ca0b-af03-4c7b-9f05-14eac8cf151d';
  const remaining = await db.select().from(creditTransactions).where(eq(creditTransactions.playerId, playerId));
  
  const summary = { group: 0, semi_private: 0, private: 0 };
  for (const t of remaining) {
    const type = t.creditType || 'group';
    if (type in summary) {
      summary[type as keyof typeof summary] += t.amount;
    }
  }
  
  console.log("\nNew balance for Aisha:");
  console.log(`  Group: ${summary.group}`);
  console.log(`  Semi-Private: ${summary.semi_private}`);
  console.log(`  Private: ${summary.private}`);
}

fixAishaCredits().then(() => process.exit(0));
