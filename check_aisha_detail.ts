import { db } from './server/db';
import { creditTransactions } from './shared/schema';
import { eq, desc } from 'drizzle-orm';

async function checkAishaDetail() {
  const playerId = 'd176ca0b-af03-4c7b-9f05-14eac8cf151d';
  
  const transactions = await db.select()
    .from(creditTransactions)
    .where(eq(creditTransactions.playerId, playerId))
    .orderBy(desc(creditTransactions.createdAt));
  
  console.log(`Found ${transactions.length} transactions for Aisha Almahasneh:\n`);
  
  for (const tx of transactions) {
    console.log(`ID: ${tx.id}`);
    console.log(`  Type: ${tx.type}, Amount: ${tx.amount}, CreditType: ${tx.creditType}`);
    console.log(`  Reason: ${tx.reason}`);
    console.log(`  PackageId: ${tx.packageId || 'null'}`);
    console.log(`  SessionId: ${tx.sessionId || 'null'}`);
    console.log(`  Metadata: ${JSON.stringify(tx.metadata)}`);
    console.log(`  CreatedAt: ${tx.createdAt}`);
    console.log('---');
  }
}

checkAishaDetail().then(() => process.exit(0));
