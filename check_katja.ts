import { db } from './server/db';
import { players, creditTransactions, sessionPlayers, sessions } from './shared/schema';
import { eq, and, desc } from 'drizzle-orm';

async function checkKatja() {
  const playerId = '209cd91c-e17c-4a7d-8172-9a324989df20';
  
  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  console.log("Player:", player[0]?.name);
  
  // Get credit transactions
  const transactions = await db.select()
    .from(creditTransactions)
    .where(eq(creditTransactions.playerId, playerId))
    .orderBy(desc(creditTransactions.createdAt));
  
  console.log(`\nFound ${transactions.length} transactions:\n`);
  
  // Summarize by type
  const summary = { group: 0, semi_private: 0, private: 0 };
  for (const tx of transactions) {
    const type = tx.creditType || 'group';
    if (type in summary) {
      summary[type as keyof typeof summary] += tx.amount;
    }
    console.log(`${tx.id}: ${tx.amount} ${tx.creditType} - ${tx.reason}`);
  }
  
  console.log(`\nCredit Balance:`);
  console.log(`  Group: ${summary.group}`);
  console.log(`  Semi-Private: ${summary.semi_private}`);
  console.log(`  Private: ${summary.private}`);
  
  // Count attended sessions
  const attendedSessions = await db.select({
    sessionType: sessions.sessionType,
  })
  .from(sessionPlayers)
  .innerJoin(sessions, eq(sessionPlayers.sessionId, sessions.id))
  .where(and(
    eq(sessionPlayers.playerId, playerId),
    eq(sessionPlayers.attendanceStatus, "present")
  ));
  
  const sessionsByType = { group: 0, semi_private: 0, private: 0 };
  for (const s of attendedSessions) {
    if (s.sessionType.includes("semi")) sessionsByType.semi_private++;
    else if (s.sessionType.includes("group")) sessionsByType.group++;
    else sessionsByType.private++;
  }
  
  console.log(`\nAttended Sessions:`);
  console.log(`  Group: ${sessionsByType.group}`);
  console.log(`  Semi-Private: ${sessionsByType.semi_private}`);
  console.log(`  Private: ${sessionsByType.private}`);
  console.log(`  Total: ${attendedSessions.length}`);
}

checkKatja().then(() => process.exit(0));
